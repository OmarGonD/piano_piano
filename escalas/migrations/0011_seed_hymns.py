"""Himnos cristianos de dominio público, escritos como hoja guía (melodía + acordes).

Avanzado e intermedio se arman con arranger.arrange(); el básico se genera con arranger.derive()
a partir del intermedio, así cumple siempre las reglas del nivel básico.
Las melodías son las tradicionales; los acordes son una armonización sencilla propia.
"""
from django.db import migrations

# ---------- Sublime gracia (Amazing Grace, melodía NEW BRITAIN, 1829) · Sol mayor, 3/4, anacrusa de 1 tiempo
AMAZING_GRACE = {
    'beats': 3, 'key': 1, 'tempo': 72, 'start': 2,
    'melody': [
        ('D4', 1),
        ('G4', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('G4', 2), ('E4', 1), ('D4', 2), ('D4', 1),
        ('G4', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('D5', 5), ('B4', 1),
        ('D5', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('G4', 2), ('E4', 1), ('D4', 2), ('D4', 1),
        ('G4', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('G4', 3),
    ],
    'chords': [(None, 3)] + [(c, 3) for c in
                             ['G', 'G7', 'C', 'G', 'G', 'Em', 'D', 'D', 'G', 'G7', 'C', 'G', 'G', 'D', 'G']],
}

# ---------- Noche de paz (Franz Gruber, 1818) · Do mayor, 3/4
SILENT_NIGHT = {
    'beats': 3, 'key': 0, 'tempo': 66, 'start': 0,
    'melody': [
        ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('D5', 2), ('D5', 1), ('B4', 3), ('C5', 2), ('C5', 1), ('G4', 3),
        ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
        ('D5', 2), ('D5', 1), ('F5', 1.5), ('D5', .5), ('B4', 1), ('C5', 3), ('E5', 3),
        ('C5', 1.5), ('G4', .5), ('E4', 1), ('G4', 1.5), ('F4', .5), ('D4', 1), ('C4', 3),
    ],
    'chords': [(c, 3) for c in ['C', 'C', 'C', 'C', 'G', 'G', 'C', 'C', 'F', 'F', 'C', 'C',
                                'F', 'F', 'C', 'C', 'G', 'G7', 'C', 'C', 'C', 'G7', 'C']],
}

# ---------- Himno de la alegría (Beethoven, Novena sinfonía, 1824) · Sol mayor, 4/4
_ODE_A = [('B4', 1), ('B4', 1), ('C5', 1), ('D5', 1), ('D5', 1), ('C5', 1), ('B4', 1), ('A4', 1),
          ('G4', 1), ('G4', 1), ('A4', 1), ('B4', 1)]
ODE_TO_JOY = {
    'beats': 4, 'key': 1, 'tempo': 84, 'start': 0,
    'melody': _ODE_A + [('B4', 1.5), ('A4', .5), ('A4', 2)]
    + _ODE_A + [('A4', 1.5), ('G4', .5), ('G4', 2)]
    + [('A4', 1), ('A4', 1), ('B4', 1), ('G4', 1), ('A4', 1), ('B4', .5), ('C5', .5), ('B4', 1), ('G4', 1),
       ('A4', 1), ('B4', .5), ('C5', .5), ('B4', 1), ('A4', 1), ('G4', 1), ('A4', 1), ('D4', 2)]
    + _ODE_A + [('A4', 1.5), ('G4', .5), ('G4', 2)],
    'chords': [('G', 4), ('D', 4), ('G', 4), ('D', 4), ('G', 4), ('D', 4), ('G', 4), ('D', 2), ('G', 2),
               ('D', 2), ('G', 2), ('D', 2), ('G', 2), ('D', 2), ('G', 2), ('G', 2), ('D', 2),
               ('G', 4), ('D', 4), ('G', 4), ('D', 2), ('G', 2)],
}

# ---------- Doxología (Louis Bourgeois, «Old 100th», 1551) · Sol mayor, 4/4
# cada verso: primera nota en blanca, seis negras y la última en redonda (3 compases)
_LINE = [2, 1, 1, 1, 1, 1, 1, 4]
_DOX_LINES = [
    ['G4', 'G4', 'F#4', 'E4', 'D4', 'G4', 'A4', 'B4'],
    ['B4', 'B4', 'B4', 'A4', 'G4', 'C5', 'B4', 'A4'],
    ['G4', 'A4', 'B4', 'A4', 'G4', 'E4', 'F#4', 'G4'],
    ['D5', 'B4', 'G4', 'A4', 'C5', 'B4', 'A4', 'G4'],
]
DOXOLOGY = {
    'beats': 4, 'key': 1, 'tempo': 72, 'start': 0,
    'melody': [(n, d) for line in _DOX_LINES for n, d in zip(line, _LINE)],
    'chords': [('G', 3), ('D', 1), ('C', 1), ('G', 2), ('D', 1), ('G', 4),
               ('G', 2), ('Em', 2), ('D', 1), ('G', 1), ('C', 1), ('G', 1), ('D', 4),
               ('G', 2), ('D', 1), ('G', 1), ('D', 1), ('G', 1), ('C', 1), ('D', 1), ('G', 4),
               ('G', 4), ('D', 1), ('Am', 1), ('G', 1), ('D', 1), ('G', 4)],
}

HYMNS = [
    ('sublime-gracia', 'Sublime gracia', 'Melodía tradicional «New Britain» (1829)',
     'El himno más cantado del mundo (Amazing Grace), en compás de tres.', AMAZING_GRACE),
    ('noche-de-paz', 'Noche de paz', 'Franz Gruber (1818)',
     'El villancico de Navidad por excelencia, con su suave balanceo en tres.', SILENT_NIGHT),
    ('himno-de-la-alegria', 'Himno de la alegría', 'L. van Beethoven (1824)',
     'La melodía de la Novena sinfonía, cantada en iglesias como «Jubilosos te adoramos».', ODE_TO_JOY),
    ('doxologia', 'Doxología', 'Louis Bourgeois (1551)',
     '«A Dios el Padre celestial»: el antiguo salmo 100, en notas largas y solemnes.', DOXOLOGY),
]

TITLES = {1: 'Melodía en Do', 2: 'Melodía y bajo', 3: 'Con segunda voz y bajo arpegiado'}
DESCRIPTIONS = {
    1: 'Solo teclas blancas: la melodía en notas largas y una nota de bajo por compás.',
    2: 'La melodía completa con la fundamental de cada acorde en la izquierda.',
    3: 'Segunda voz en los tiempos fuertes y bajo arpegiado en negras.',
}


def seed(apps, schema_editor):
    from escalas.arranger import arrange, derive, lead_sheet

    Song = apps.get_model('escalas', 'Song')
    SongArrangement = apps.get_model('escalas', 'SongArrangement')
    Song.objects.filter(slug='la-maritza').update(category='popular')
    Song.objects.filter(slug='passacaglia').update(category='clasica')
    for i, (slug, title, composer, description, h) in enumerate(HYMNS):
        song, _ = Song.objects.update_or_create(slug=slug, defaults=dict(
            title=title, composer=composer, description=description, category='cristiana', order=100 + i * 10))
        melody, chords = lead_sheet(h['melody'], h['chords'], h['start'])
        versions = {3: (arrange(melody, chords, h['beats'], 3), h['key'])}
        versions[2] = (arrange(melody, chords, h['beats'], 2), h['key'])
        versions[1] = derive(versions[2][0], h['key'], h['beats'], 1)
        for level, (notes, key) in versions.items():
            SongArrangement.objects.update_or_create(song=song, level=level, defaults=dict(
                title=TITLES[level], description=DESCRIPTIONS[level], notes=notes, key_fifths=key,
                beats_per_bar=h['beats'], tempo=round(h['tempo'] * {1: .8, 2: .9, 3: 1}[level])))


def unseed(apps, schema_editor):
    apps.get_model('escalas', 'Song').objects.filter(slug__in=[h[0] for h in HYMNS]).delete()


class Migration(migrations.Migration):
    dependencies = [('escalas', '0010_song_category')]
    operations = [migrations.RunPython(seed, unseed)]
