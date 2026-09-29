"""Passacaglia (Händel, Suite en sol menor HWV 432) en tres niveles.

Son arreglos propios sobre la armonía de la obra, el ciclo de quintas de sol menor:
Solm – Dom – Fa – Si♭ – Mi♭ – La° – Re – Solm. Para usar la partitura oficial exacta en un nivel,
importa un MIDI con `python manage.py import_song_midi passacaglia <nivel> archivo.mid`.
"""
from django.db import migrations

# Por compás: voces de la mano derecha (grave, media, aguda), fundamental y quinta del bajo (MIDI).
BARS = [
    ('Solm', (67, 70, 74), 43, 50),
    ('Dom', (67, 72, 75), 48, 55),
    ('Fa', (69, 72, 77), 41, 48),
    ('Si♭', (70, 74, 77), 46, 53),
    ('Mi♭', (70, 75, 79), 39, 46),
    ('La°', (72, 75, 79), 45, 51),
    ('Re', (69, 74, 78), 38, 45),
    ('Solm', (67, 70, 74), 43, 50),
]


def notes_seq(start, dur, pitches):
    """Una nota tras otra, cada una de `dur` tiempos."""
    return [[start + i * dur, dur, p] for i, p in enumerate(pitches)]


def basic():
    rh, lh = [], []
    for b, (_, (lo, mid, top), root, _) in enumerate(BARS):
        t = b * 4
        rh += notes_seq(t, 2, [mid, top] if b < 7 else [mid, lo])
        lh.append([t, 4, root])
    return {'rh': rh, 'lh': lh}


def intermediate():
    rh, lh = [], []
    for rep in range(2):
        for b, (_, (lo, mid, top), root, fifth) in enumerate(BARS):
            t = (rep * 8 + b) * 4
            last = rep == 1 and b == 7
            if last:
                rh += notes_seq(t, 1, [lo, mid, top, lo + 12])
                lh.append([t, 4, root])
                continue
            rh += notes_seq(t, 1, [lo, mid, top, mid] if rep == 0 else [top, mid, lo, mid])
            lh += notes_seq(t, 2, [root, fifth])
    return {'rh': rh, 'lh': lh}


def advanced():
    rh, lh = [], []
    for rep in range(2):
        for b, (_, (lo, mid, top), root, fifth) in enumerate(BARS):
            t = (rep * 8 + b) * 4
            if rep == 1 and b == 7:
                rh += [[t, 4, p] for p in (lo, mid, top, lo + 12)]
                lh += [[t, 4, root - 12], [t, 4, root]]
                continue
            if rep == 0:
                rh += notes_seq(t, 0.5, [lo, mid, top, lo + 12, top, mid, lo, mid])
                lh += notes_seq(t, 1, [root, fifth, root + 12, fifth])
            else:
                rh += notes_seq(t, 0.5, [lo + 12, top, mid, lo, mid, top, lo + 12, top])
                lh += notes_seq(t, 1, [root, root + 12, fifth, root + 12])
    return {'rh': rh, 'lh': lh}


VERSIONS = [
    (1, 'Melodía y bajo', 'Dos notas por compás en la derecha y una nota larga en la izquierda.', 60, basic),
    (2, 'Acordes desplegados', 'Arpegios en negras sobre un bajo que alterna fundamental y quinta.', 72, intermediate),
    (3, 'Variación en corcheas', 'Arpegios de dos octavas en corcheas y bajo en negras, con el final en acordes.',
     80, advanced),
]


def seed(apps, schema_editor):
    Song = apps.get_model('escalas', 'Song')
    SongArrangement = apps.get_model('escalas', 'SongArrangement')
    song, _ = Song.objects.update_or_create(slug='passacaglia', defaults=dict(
        title='Passacaglia', composer='G. F. Händel (arr. Halvorsen)',
        description='El famoso bajo en ciclo de quintas de la Suite en sol menor HWV 432. '
                    'Aprende primero la mano derecha, luego la izquierda y al final las dos juntas.',
        order=10))
    for level, title, desc, tempo, build in VERSIONS:
        SongArrangement.objects.update_or_create(song=song, level=level, defaults=dict(
            title=title, description=desc, tempo=tempo, beats_per_bar=4, key_fifths=-2, notes=build()))


def unseed(apps, schema_editor):
    apps.get_model('escalas', 'Song').objects.filter(slug='passacaglia').delete()


class Migration(migrations.Migration):
    dependencies = [('escalas', '0007_songs')]
    operations = [migrations.RunPython(seed, unseed)]
