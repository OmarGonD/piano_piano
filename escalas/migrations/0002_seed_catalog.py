from django.db import migrations

SCALES = [
    ('major', 'Mayor', '', [0, 2, 4, 5, 7, 9, 11], None, None, 'major'),
    ('natural', 'Menor natural', '', [0, 2, 3, 5, 7, 8, 10], None, None, ''),
    ('harmonic', 'Menor armónica', '', [0, 2, 3, 5, 7, 8, 11], None, None, ''),
    ('melodic', 'Menor melódica', 'baja natural', [0, 2, 3, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], None, ''),
    ('dorian', 'Dórica', '', [0, 2, 3, 5, 7, 9, 10], None, None, ''),
    ('phrygian', 'Frigia', '', [0, 1, 3, 5, 7, 8, 10], None, None, ''),
    ('lydian', 'Lidia', '', [0, 2, 4, 6, 7, 9, 11], None, None, ''),
    ('mixolydian', 'Mixolidia', '', [0, 2, 4, 5, 7, 9, 10], None, None, ''),
    ('locrian', 'Locria', '', [0, 1, 3, 5, 6, 8, 10], None, None, ''),
    ('pentaMaj', 'Pentatónica mayor', '', [0, 2, 4, 7, 9], None, [0, 1, 2, 4, 5], ''),
    ('pentaMin', 'Pentatónica menor', '', [0, 3, 5, 7, 10], None, [0, 2, 3, 4, 6], ''),
]

PROGRESSIONS = {
    'major': [
        ('I-vi-IV-V', [{'d': 0}, {'d': 5}, {'d': 3}, {'d': 4}]),
        ('I-vi-ii-V7', [{'d': 0}, {'d': 5}, {'d': 1}, {'d': 4, 's': 1}]),
        ('I-IV-V7-I', [{'d': 0}, {'d': 3}, {'d': 4, 's': 1}, {'d': 0}]),
        ('I-V-vi-IV', [{'d': 0}, {'d': 4}, {'d': 5}, {'d': 3}]),
    ],
    'minor': [
        ('i-iv-V7-i', [{'d': 0}, {'d': 3}, {'d': 4, 's': 1, 'h': 1}, {'d': 0}]),
        ('i-VI-III-VII', [{'d': 0}, {'d': 5}, {'d': 2}, {'d': 6}]),
        ('i-VI-VII-i', [{'d': 0}, {'d': 5}, {'d': 6}, {'d': 0}]),
        ('i-iv-VII-III', [{'d': 0}, {'d': 3}, {'d': 6}, {'d': 2}]),
    ],
}


def seed(apps, schema_editor):
    ScaleType = apps.get_model('escalas', 'ScaleType')
    Progression = apps.get_model('escalas', 'Progression')
    for i, (slug, name, desc, up, down, letters, fing) in enumerate(SCALES):
        ScaleType.objects.update_or_create(slug=slug, defaults=dict(
            name=name, description=desc, intervals=up, descending=down,
            letters=letters, fingering=fing, order=i * 10))
    for mode, items in PROGRESSIONS.items():
        for i, (code, chords) in enumerate(items):
            Progression.objects.update_or_create(key_mode=mode, code=code, defaults=dict(chords=chords, order=i * 10))


def unseed(apps, schema_editor):
    apps.get_model('escalas', 'ScaleType').objects.filter(slug__in=[s[0] for s in SCALES]).delete()
    apps.get_model('escalas', 'Progression').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [('escalas', '0001_initial')]
    operations = [migrations.RunPython(seed, unseed)]
