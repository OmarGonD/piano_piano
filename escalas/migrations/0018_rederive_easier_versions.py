from django.db import migrations

GENERATED = (
    'Generada automáticamente: teclas blancas, notas largas y una nota a la vez por mano.',
    'Generada automáticamente: la melodía y un bajo por medio compás.',
)


def rederive(apps, schema_editor):
    """Vuelve a generar las versiones básica e intermedio que salieron solas de la avanzada, con el arreglo mejorado.
    Las que se escribieron a mano (otra descripción) no se tocan."""
    from escalas.arranger import basic_problems, derive
    from escalas.fingering import compute
    SongArrangement = apps.get_model('escalas', 'SongArrangement')
    for full in SongArrangement.objects.filter(level=3):
        for lower in SongArrangement.objects.filter(song_id=full.song_id, level__in=(1, 2), description__in=GENERATED):
            notes, key = derive(full.notes, full.key_fifths, full.beats_per_bar, lower.level)
            if lower.level == 1 and basic_problems(notes, key):
                continue
            if not notes['rh'] and not notes['lh']:
                continue
            lower.notes, lower.key_fifths, lower.fingering = notes, key, compute(notes)
            lower.save(update_fields=['notes', 'key_fifths', 'fingering'])


class Migration(migrations.Migration):
    dependencies = [('escalas', '0017_seed_fingering')]
    operations = [migrations.RunPython(rederive, migrations.RunPython.noop)]
