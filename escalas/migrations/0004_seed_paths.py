from django.db import migrations

PATHS = [
    ('solista', 'Solista', 'Lee partituras y toca música clásica.',
     'Aprende a leer el pentagrama nota a nota, hasta tocar piezas escritas.'),
    ('banda', 'Banda', 'Acompaña canciones con acordes.',
     'Aprende acordes, inversiones y progresiones para tocar con otros músicos.'),
]

MODULES = [
    ('solista', 'clave-de-sol-pentagrama', 'Clave de sol: las notas del pentagrama',
     'Reconoce las nueve notas que caen en las líneas y espacios, de Mi4 a Fa5, y tócalas en el piano.',
     'note_reading', {'clef': 'treble', 'low': 64, 'high': 77, 'naturals': True, 'count': 15}),
]


def seed(apps, schema_editor):
    LearningPath = apps.get_model('escalas', 'LearningPath')
    Module = apps.get_model('escalas', 'Module')
    paths = {}
    for i, (slug, name, tagline, desc) in enumerate(PATHS):
        paths[slug], _ = LearningPath.objects.update_or_create(
            slug=slug, defaults=dict(name=name, tagline=tagline, description=desc, order=i * 10))
    for i, (path, slug, title, summary, kind, config) in enumerate(MODULES):
        Module.objects.update_or_create(slug=slug, defaults=dict(
            path=paths[path], title=title, summary=summary, kind=kind, config=config, order=(i + 1) * 10))


def unseed(apps, schema_editor):
    apps.get_model('escalas', 'LearningPath').objects.filter(slug__in=[p[0] for p in PATHS]).delete()


class Migration(migrations.Migration):
    dependencies = [('escalas', '0003_paths_and_modules')]
    operations = [migrations.RunPython(seed, unseed)]
