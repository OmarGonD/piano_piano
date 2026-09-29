"""Lectura mínima de archivos MIDI estándar (formatos 0 y 1) para cargar versiones de canciones."""
import math
import struct

from django.utils.translation import gettext


class MidiError(ValueError):
    pass


def _varlen(data, i):
    value = 0
    while True:
        b = data[i]
        i += 1
        value = (value << 7) | (b & 0x7F)
        if not b & 0x80:
            return value, i


def parse(data):
    """Devuelve (división en ticks por negra, pistas). Cada pista es una lista de eventos
    (tick absoluto, tipo, valores) con tipo 'on', 'off', 'tempo', 'time', 'key' o 'marker'."""
    if data[:4] != b'MThd':
        raise MidiError(gettext('No es un archivo MIDI (falta la cabecera MThd).'))
    _, ntracks, division = struct.unpack('>HHH', data[8:14])
    if division & 0x8000:
        raise MidiError(gettext('Los MIDI con división SMPTE no están soportados.'))
    i, tracks = 8 + struct.unpack('>I', data[4:8])[0], []
    for _ in range(ntracks):
        if data[i:i + 4] != b'MTrk':
            raise MidiError(gettext('Pista MIDI mal formada.'))
        end = i + 8 + struct.unpack('>I', data[i + 4:i + 8])[0]
        i += 8
        tick, status, events = 0, None, []
        while i < end:
            delta, i = _varlen(data, i)
            tick += delta
            if data[i] & 0x80:
                status = data[i]
                i += 1
            if status == 0xFF:
                kind = data[i]
                length, i = _varlen(data, i + 1)
                body = data[i:i + length]
                i += length
                if kind == 0x51:
                    events.append((tick, 'tempo', int.from_bytes(body, 'big')))
                elif kind == 0x58:
                    events.append((tick, 'time', body[0]))
                elif kind == 0x59:
                    events.append((tick, 'key', struct.unpack('b', body[:1])[0]))
                elif kind in (0x06, 0x07):  # marcador o punto de referencia: aquí suelen ir «Coro», «Estrofa»…
                    events.append((tick, 'marker', _text(body)))
                continue
            if status in (0xF0, 0xF7):
                length, i = _varlen(data, i)
                i += length
                continue
            if status is None:
                raise MidiError(gettext('Evento MIDI sin estado.'))
            cmd, nbytes = status & 0xF0, 1 if status & 0xF0 in (0xC0, 0xD0) else 2
            args = data[i:i + nbytes]
            i += nbytes
            if cmd == 0x90 and args[1] > 0:
                events.append((tick, 'on', (status & 0x0F, args[0])))
            elif cmd == 0x80 or (cmd == 0x90 and args[1] == 0):
                events.append((tick, 'off', (status & 0x0F, args[0])))
        tracks.append(events)
        i = end
    return division, tracks


def to_arrangement(data, rh_track=None, lh_track=None, split=60, grid=0.25):
    """Convierte un MIDI en {'notes': {'rh', 'lh'}, 'tempo', 'beats_per_bar', 'key_fifths'}.
    Las manos se separan por pista si se indican; si el MIDI trae justo dos pistas con notas, cada una es
    una mano (la más aguda, la derecha); si no, por altura (>= split va a la derecha)."""
    division, tracks = parse(data)
    if rh_track is None and lh_track is None:
        with_notes = [(ti, [v[1] for _, kind, v in ev if kind == 'on']) for ti, ev in enumerate(tracks)]
        with_notes = [(ti, ps) for ti, ps in with_notes if ps]
        if len(with_notes) == 2:
            (lh_track, _), (rh_track, _) = sorted(with_notes, key=lambda x: sum(x[1]) / len(x[1]))
    q = lambda ticks: max(0.0, round(ticks / division / grid) * grid)
    meta = {}
    markers = set()
    notes = {'rh': [], 'lh': []}
    for ti, events in enumerate(tracks):
        open_notes = {}
        for tick, kind, value in events:
            if kind == 'marker':
                markers.add((tick, value))
                continue
            if kind in ('tempo', 'time', 'key'):
                meta.setdefault(kind, value)  # vale el primero: la canción empieza con esos valores
                continue
            if kind == 'on':
                open_notes.setdefault(value, []).append(tick)
            elif kind == 'off' and open_notes.get(value):
                start = open_notes[value].pop(0)
                pitch = value[1]
                if rh_track is not None or lh_track is not None:
                    hand = 'rh' if ti == rh_track else 'lh' if ti == lh_track else None
                else:
                    hand = 'rh' if pitch >= split else 'lh'
                if hand and 21 <= pitch <= 108:
                    t, d = q(start), max(grid, q(tick) - q(start))
                    notes[hand].append([_num(t), _num(d), pitch])
    for hand in notes:
        notes[hand].sort(key=lambda n: (n[0], n[2]))
    if not notes['rh'] and not notes['lh']:
        raise MidiError(gettext('El MIDI no tiene notas en las pistas elegidas.'))
    beats = meta.get('time', 4)
    end = max(n[0] + n[1] for h in notes.values() for n in h)
    sections = _sections(markers, division, beats, math.ceil(end / beats - 1e-6))
    return {'sections': sections, 'notes': notes, 'tempo': round(60_000_000 / meta.get('tempo', 500000)),
            'beats_per_bar': beats, 'key_fifths': meta.get('key', 0)}


def _num(x):
    return int(x) if float(x).is_integer() else x


def _text(body):
    for enc in ('utf-8', 'latin-1'):
        try:
            return body.decode(enc).strip()
        except UnicodeDecodeError:
            pass
    return ''


def _sections(markers, division, beats, n_bars):
    """Partes de la canción a partir de los marcadores del MIDI: cada una va de su marcador al siguiente.
    Devuelve [{'name', 'from', 'to'}] con compases desde 1. Sin marcadores útiles, una lista vacía."""
    marks = sorted((t, name) for t, name in markers if name)
    starts = [(int(t / division / beats + 1e-6) + 1, name) for t, name in marks]
    out = []
    for i, (bar, name) in enumerate(starts):
        nxt = starts[i + 1][0] if i + 1 < len(starts) else n_bars + 1
        if bar <= n_bars and nxt - 1 >= bar:
            out.append({'name': name[:40], 'from': bar, 'to': min(n_bars, nxt - 1)})
    return out
