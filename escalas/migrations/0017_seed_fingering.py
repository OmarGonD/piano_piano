from django.db import migrations


def seed(apps, schema_editor):
    """Calcula los dedos de las versiones que ya existen."""
    from escalas.fingering import compute
    SongArrangement = apps.get_model('escalas', 'SongArrangement')
    for arr in SongArrangement.objects.all():
        if not arr.fingering:
            arr.fingering = compute(arr.notes)
            arr.save(update_fields=['fingering'])


class Migration(migrations.Migration):
    dependencies = [('escalas', '0016_arrangement_fingering')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
