from django.db import migrations


def rederive(apps, schema_editor):
    from escalas import rederive
    rederive.run(apps.get_model('escalas', 'SongArrangement'))


class Migration(migrations.Migration):
    dependencies = [('escalas', '0018_rederive_easier_versions')]
    operations = [migrations.RunPython(rederive, migrations.RunPython.noop)]
