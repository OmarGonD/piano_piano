"""Carga de un MIDI como versión de una canción. La usan el comando import_song_midi y la subida web."""
from django.core.exceptions import ValidationError

from .arranger import derive
from .midi_import import MidiError, to_arrangement
from .musicxml_import import is_musicxml, parse_musicxml
from .models import Module, SongArrangement
from django.utils.translation import gettext, gettext_noop as _noop

# se guardan en español y se traducen al mostrarlos (la marca _() deja los textos en el catálogo)
TITLES = {1: _noop('Versión básica'), 2: _noop('Melodía y bajo'), 3: _noop('Versión completa')}
DESCRIPTIONS = {
    1: _noop('Generada automáticamente: teclas blancas, notas largas y una nota a la vez por mano.'),
    2: _noop('Generada automáticamente: la melodía y un bajo por medio compás.'),
}


class SongImportError(ValueError):
    pass


def import_midi(song, level, data, derive_lower=False, rh_track=None, lh_track=None, split=60, grid=0.25,
                title=None, tempo=None, key=None):
    """Guarda el MIDI (bytes) como la versión de `level` y, con derive_lower, genera los niveles inferiores.
    Devuelve un resumen por versión guardada. Lanza SongImportError si el MIDI o alguna versión no vale."""
    try:
        parsed = parse_musicxml(data, split) if is_musicxml(data) else to_arrangement(data, rh_track, lh_track, split, grid)
    except MidiError as e:
        raise SongImportError(str(e))
    tempo = tempo or parsed['tempo']
    key = parsed['key_fifths'] if key is None else key
    beats = parsed['beats_per_bar']
    versions = [(level, parsed['notes'], key, tempo, title or TITLES[level], '')]
    if derive_lower:
        for lower in range(level - 1, 0, -1):
            notes, lower_key = derive(parsed['notes'], key, beats, lower)
            versions.append((lower, notes, lower_key, max(50, round(tempo * (0.7 + 0.1 * lower))),
                             TITLES[lower], DESCRIPTIONS[lower]))
    # se valida todo antes de guardar nada, para no dejar la canción a medias
    arrs = [_build(song, *v, beats) for v in versions]
    for arr in arrs:
        arr.save()
    if parsed['sections']:  # sin marcadores en el MIDI se conservan las partes que ya hubiera
        song.sections = parsed['sections']
        song.save(update_fields=['sections'])
    return [gettext('%(song)s · %(level)s: %(rh)d notas en la derecha, %(lh)d en la izquierda, %(tempo)d BPM, armadura %(key)d.')
            % {'song': song.title, 'level': gettext(Module.Level(a.level).label), 'rh': len(a.notes['rh']),
               'lh': len(a.notes['lh']), 'tempo': a.tempo, 'key': a.key_fifths} for a in arrs]


def _build(song, level, notes, key, tempo, title, description, beats):
    arr = SongArrangement.objects.filter(song=song, level=level).first() or SongArrangement(song=song, level=level)
    arr.title, arr.description, arr.notes = title, description or arr.description, notes
    arr.tempo, arr.beats_per_bar, arr.key_fifths = tempo, beats, key
    try:
        arr.full_clean()
    except ValidationError as e:
        raise SongImportError(gettext('Nivel %(level)d: %(errors)s') % {'level': level, 'errors': ' '.join(e.messages)})
    return arr
