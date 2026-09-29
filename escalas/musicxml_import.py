"""Lectura de partituras MusicXML (.musicxml, .xml o .mxl comprimido) para cargar versiones de canciones.
A diferencia del MIDI trae las duraciones exactas, la mano de cada nota (pentagrama), las repeticiones y las
marcas de ensayo, así que no hay que adivinar ni cuantizar."""
import io
import math
import re
import xml.etree.ElementTree as ET
import zipfile
from fractions import Fraction

from django.utils.translation import gettext

from .midi_import import MidiError

STEPS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
UNIT_QUARTERS = {'whole': 4, 'half': 2, 'quarter': 1, 'eighth': Fraction(1, 2), '16th': Fraction(1, 4)}
SECTION_WORDS = re.compile(r'^(intro|introducci[oó]n|verso|estrofa|coro|estribillo|refr[aá]n|puente|final|coda|'
                           r'outro|verse|chorus|bridge|interlude|interludio|solo)\b', re.I)


class ScoreError(MidiError):
    pass


def is_musicxml(data):
    return data[:2] == b'PK' or data.lstrip()[:5] == b'<?xml' or b'<score-partwise' in data[:2000]


def _load(data):
    if data[:2] == b'PK':  # .mxl: un zip con container.xml que apunta a la partitura
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
            name = None
            if 'META-INF/container.xml' in z.namelist():
                rf = ET.fromstring(z.read('META-INF/container.xml')).find('.//rootfile')
                name = rf.get('full-path') if rf is not None else None
            name = name or next(n for n in z.namelist() if n.endswith(('.xml', '.musicxml')) and 'META-INF' not in n)
            data = z.read(name)
        except (zipfile.BadZipFile, StopIteration, KeyError, ET.ParseError):
            raise ScoreError(gettext('No se pudo abrir el archivo .mxl.'))
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        raise ScoreError(gettext('El archivo MusicXML está mal formado.'))
    if root.tag != 'score-partwise':
        raise ScoreError(gettext('Solo se admite MusicXML «partwise» (el que exportan MuseScore, Finale y Sibelius).'))
    return root


def _midi(pitch):
    alter = pitch.findtext('alter')
    return 12 * (int(pitch.findtext('octave')) + 1) + STEPS[pitch.findtext('step')] + (round(float(alter)) if alter else 0)


def _play_order(measures):
    """Orden en que suenan los compases, con repeticiones y casillas de primera/segunda vez."""
    endings, current = {}, None  # compás -> casillas (números de vez) en que suena
    for idx, m in enumerate(measures):
        for e in m.iter('ending'):
            if e.get('type') == 'start':
                current = set(re.split(r'[ ,]+', e.get('number', '1')))
        endings[idx] = current
        if any(e.get('type') in ('stop', 'discontinue') for e in m.iter('ending')):
            current = None
    order, i, start, vez, jumped = [], 0, 0, 1, False
    has = lambda m, d: any(r.get('direction') == d for r in m.iter('repeat'))
    while i < len(measures) and len(order) < 20 * len(measures):
        m = measures[i]
        if endings[i] is not None and str(vez) not in endings[i]:
            i += 1
            continue
        if has(m, 'forward') and not jumped:
            start, vez = i, 1
        jumped = False
        order.append(i)
        if has(m, 'backward'):
            if vez == 1:
                vez, i, jumped = 2, start, True
                continue
            vez = 1
        i += 1
    return order


def parse_musicxml(data, split=60):
    """Devuelve {'notes': {'rh', 'lh'}, 'tempo', 'beats_per_bar', 'key_fifths', 'sections'} como el importador MIDI."""
    root = _load(data)
    parts = root.findall('part')
    if not parts:
        raise ScoreError(gettext('El MusicXML no tiene partes.'))
    # una parte con dos pentagramas (piano) o dos partes: la primera es la mano derecha
    hand_of = lambda pi, staff: ('rh' if staff == 1 else 'lh') if len(parts) == 1 and _n_staves(parts[0]) >= 2 else \
        ('rh' if pi == 0 else 'lh')
    single = len(parts) == 1 and _n_staves(parts[0]) < 2
    notes = {'rh': [], 'lh': []}
    meta = {}
    marks = []  # (compás de salida, nombre)
    for pi, part in enumerate(parts[:2]):
        measures = part.findall('measure')
        div = 1
        pos = Fraction(0)       # inicio del compás actual, en negras
        open_ties = {}
        for out_idx, mi in enumerate(_play_order(measures)):
            m = measures[mi]
            for a in m.findall('attributes'):
                if a.findtext('divisions'):
                    div = int(a.findtext('divisions'))
                if a.find('key') is not None and 'key' not in meta:
                    meta['key'] = int(a.findtext('key/fifths') or 0)
                if a.find('time') is not None:  # la primera métrica manda (el resto de la app usa un solo compás)
                    top = sum(int(x) for x in a.findtext('time/beats').split('+'))
                    meta.setdefault('beats', Fraction(top * 4, int(a.findtext('time/beat-type'))))
            for d in m.findall('direction'):
                s = d.find('sound')
                if s is not None and s.get('tempo') and 'tempo' not in meta:
                    meta['tempo'] = float(s.get('tempo'))
                mt = d.find('direction-type/metronome')
                if mt is not None and 'tempo' not in meta and mt.findtext('per-minute'):
                    unit = UNIT_QUARTERS.get(mt.findtext('beat-unit'), 1)
                    unit = unit * (Fraction(3, 2) if mt.find('beat-unit-dot') is not None else 1)
                    meta['tempo'] = float(mt.findtext('per-minute').split('-')[0]) * float(unit)
                if pi == 0:
                    for tag in ('rehearsal', 'words'):
                        for x in d.iter(tag):
                            text = (x.text or '').strip()
                            if text and (tag == 'rehearsal' or SECTION_WORDS.match(text)):
                                marks.append((out_idx, text))
            cur, end, events = Fraction(0), Fraction(0), []
            last_start = Fraction(0)
            for el in m:
                if el.tag == 'backup':
                    cur -= Fraction(int(el.findtext('duration')), div)
                elif el.tag == 'forward':
                    cur += Fraction(int(el.findtext('duration')), div)
                elif el.tag == 'note':
                    if el.find('grace') is not None:
                        continue
                    dur = Fraction(int(el.findtext('duration') or 0), div)
                    is_chord = el.find('chord') is not None
                    start = last_start if is_chord else cur
                    if not is_chord:
                        last_start = cur
                        cur += dur
                    if el.find('rest') is None and el.find('pitch') is not None:
                        staff = int(el.findtext('staff') or 1)
                        pitch = _midi(el.find('pitch'))
                        ties = {t.get('type') for t in el.findall('tie')}
                        events.append((start, dur, pitch, hand_of(pi, staff) if not single else
                                       ('rh' if pitch >= split else 'lh'), staff, ties))
                end = max(end, cur)
            for start, dur, pitch, hand, staff, ties in events:
                t = pos + start
                key = (hand, staff, pitch)
                if 'stop' in ties and key in open_ties:
                    ev = open_ties[key]
                    ev[1] = float(Fraction(ev[1]).limit_denominator(1000) + dur)
                    if 'start' not in ties:
                        del open_ties[key]
                    continue
                ev = [_num(float(t)), _num(float(dur)), pitch]
                notes[hand].append(ev)
                if 'start' in ties:
                    open_ties[key] = ev
            full = meta.get('beats', Fraction(4))
            # el compás mide lo que dice la métrica; un compás incompleto (anacrusa) ocupa el compás entero
            pos += full
            if out_idx == 0 and m.get('implicit') == 'yes' and end < full:
                shift = full - end
                for h in notes:
                    for ev in notes[h]:
                        ev[0] = _num(ev[0] + float(shift))
    for h in notes:
        notes[h] = [ev for ev in notes[h] if 21 <= ev[2] <= 108 and ev[1] > 0]
        notes[h].sort(key=lambda n: (n[0], n[2]))
    if not notes['rh'] and not notes['lh']:
        raise ScoreError(gettext('El MusicXML no tiene notas.'))
    beats = meta.get('beats', Fraction(4))
    bpb = max(1, round(float(beats)))
    n_bars = math.ceil(max(n[0] + n[1] for h in notes.values() for n in h) / bpb - 1e-6)
    return {'notes': notes, 'tempo': round(meta.get('tempo', 100)), 'beats_per_bar': bpb,
            'key_fifths': meta.get('key', 0), 'sections': _sections(marks, n_bars)}


def _n_staves(part):
    return int(part.findtext('measure/attributes/staves') or 1)


def _sections(marks, n_bars):
    marks = sorted(dict.fromkeys(marks))
    out = []
    for i, (idx, name) in enumerate(marks):
        bar = idx + 1
        nxt = marks[i + 1][0] + 1 if i + 1 < len(marks) else n_bars + 1
        if bar <= n_bars and nxt - 1 >= bar:
            out.append({'name': name[:40], 'from': bar, 'to': min(n_bars, nxt - 1)})
    return out


def _num(x):
    x = round(x, 4)
    return int(x) if float(x).is_integer() else x
