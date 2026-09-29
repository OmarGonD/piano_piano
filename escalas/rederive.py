"""Regenera las versiones básica e intermedia que salieron solas de la avanzada.
Las escritas a mano (otra descripción, p. ej. «Versión preparada a mano.») no se tocan."""
from .arranger import basic_problems, derive
from .fingering import compute

GENERATED = (
    'Generada automáticamente: teclas blancas, notas largas y una nota a la vez por mano.',
    'Generada automáticamente: la melodía y un bajo por medio compás.',
)


def run(SongArrangement):
    """Devuelve cuántas versiones se regeneraron."""
    n = 0
    for full in SongArrangement.objects.filter(level=3):
        for lower in SongArrangement.objects.filter(song_id=full.song_id, level__in=(1, 2), description__in=GENERATED):
            notes, key = derive(full.notes, full.key_fifths, full.beats_per_bar, lower.level)
            if (lower.level == 1 and basic_problems(notes, key)) or not (notes['rh'] or notes['lh']):
                continue
            lower.notes, lower.key_fifths, lower.fingering = notes, key, compute(notes)
            lower.save(update_fields=['notes', 'key_fifths', 'fingering'])
            n += 1
    return n
