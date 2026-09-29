from django.db import migrations

BASIC, INTERMEDIATE, ADVANCED = 1, 2, 3

# (camino, nivel, slug, título, resumen, tipo, configuración)
MODULES = [
    # ---------- Solista: lectura para música clásica ----------
    ('solista', BASIC, 'clave-de-sol-pentagrama', 'Clave de sol: las notas del pentagrama',
     'Reconoce las nueve notas que caen en las líneas y espacios, de Mi4 a Fa5, y tócalas en el piano.',
     'note_reading', {'clef': 'treble', 'low': 64, 'high': 77, 'count': 15}),
    ('solista', BASIC, 'clave-de-sol-lineas-adicionales', 'Clave de sol: líneas adicionales',
     'Suma el Do central y las notas que se salen del pentagrama por arriba, hasta La5.',
     'note_reading', {'clef': 'treble', 'low': 60, 'high': 81, 'count': 15}),
    ('solista', BASIC, 'clave-de-fa-pentagrama', 'Clave de fa: las notas del pentagrama',
     'La clave de la mano izquierda: de Sol2 a La3, en líneas y espacios.',
     'note_reading', {'clef': 'bass', 'low': 43, 'high': 57, 'count': 15}),

    ('solista', INTERMEDIATE, 'clave-de-fa-lineas-adicionales', 'Clave de fa: líneas adicionales',
     'Del Do2 grave hasta el Mi4, que se escribe sobre el pentagrama de fa.',
     'note_reading', {'clef': 'bass', 'low': 36, 'high': 64, 'count': 15}),
    ('solista', INTERMEDIATE, 'alteraciones-clave-de-sol', 'Sostenidos y bemoles',
     'Las mismas notas de la clave de sol, ahora con ♯ y ♭. Fíjate en la alteración antes de tocar.',
     'note_reading', {'clef': 'treble', 'low': 60, 'high': 79, 'accidentals': True, 'count': 15}),
    ('solista', INTERMEDIATE, 'frases-por-grados', 'Frases por grados conjuntos',
     'Lee frases cortas de cinco notas que se mueven por notas vecinas, como en una melodía.',
     'melody_reading', {'clef': 'treble', 'low': 60, 'high': 79, 'length': 5, 'count': 6, 'max_leap': 2}),

    ('solista', ADVANCED, 'dos-claves', 'Las dos claves alternadas',
     'Cada nota aparece en su clave, sol o fa, como en una partitura de piano. Cambia de lectura sin pausa.',
     'note_reading', {'clef': 'mixed', 'low': 40, 'high': 81, 'count': 20}),
    ('solista', ADVANCED, 'primera-vista-clave-de-sol', 'Primera vista: saltos y alteraciones',
     'Frases de ocho notas con saltos amplios y alteraciones en clave de sol.',
     'melody_reading', {'clef': 'treble', 'low': 57, 'high': 84, 'length': 8, 'count': 6, 'max_leap': 5,
                        'accidentals': True}),
    ('solista', ADVANCED, 'primera-vista-clave-de-fa', 'Primera vista en clave de fa',
     'Frases de ocho notas para la mano izquierda, con saltos y alteraciones.',
     'melody_reading', {'clef': 'bass', 'low': 36, 'high': 64, 'length': 8, 'count': 6, 'max_leap': 4,
                        'accidentals': True}),

    # ---------- Banda: acordes para acompañar ----------
    ('banda', BASIC, 'acordes-mayores', 'Acordes mayores',
     'Do, Fa, Sol, Re, La y Mi: los acordes más usados en canciones. Verás sus notas en el teclado.',
     'chord_play', {'chords': ['C', 'F', 'G', 'D', 'A', 'E'], 'count': 12, 'hints': 'always'}),
    ('banda', BASIC, 'acordes-menores', 'Acordes menores',
     'El sonido más oscuro: La menor, Re menor, Mi menor y compañía.',
     'chord_play', {'chords': ['Am', 'Dm', 'Em', 'Bm', 'Gm', 'Cm'], 'count': 12, 'hints': 'always'}),
    ('banda', BASIC, 'primera-progresion', 'Tu primera progresión: I–IV–V',
     'Encadena los tres acordes principales de una tonalidad, en Do y en Sol.',
     'chord_play', {'sequences': [{'name': 'I–IV–V–I en Do mayor', 'chords': ['C', 'F', 'G', 'C']},
                                  {'name': 'I–IV–V–I en Sol mayor', 'chords': ['G', 'C', 'D', 'G']}],
                    'laps': 2, 'hints': 'always'}),

    ('banda', INTERMEDIATE, 'acordes-con-alteraciones', 'Acordes con sostenidos y bemoles',
     'Si♭, Mi♭, La♭, Fa♯ menor… Ahora las notas solo aparecen si te equivocas.',
     'chord_play', {'chords': ['Bb', 'Eb', 'Ab', 'Db', 'B', 'F#m', 'C#m', 'G#m'], 'count': 12,
                    'hints': 'on_error'}),
    ('banda', INTERMEDIATE, 'acordes-de-septima', 'Acordes de séptima',
     'Séptima de dominante, menor séptima y séptima mayor: el color del pop, el soul y el jazz.',
     'chord_play', {'chords': ['G7', 'C7', 'D7', 'A7', 'Am7', 'Dm7', 'Em7', 'Cmaj7', 'Fmaj7'], 'count': 12,
                    'hints': 'on_error'}),
    ('banda', INTERMEDIATE, 'progresion-pop', 'La progresión pop: I–V–vi–IV',
     'La progresión de cientos de canciones, en cuatro tonalidades.',
     'chord_play', {'sequences': [{'name': 'I–V–vi–IV en Do', 'chords': ['C', 'G', 'Am', 'F']},
                                  {'name': 'I–V–vi–IV en Sol', 'chords': ['G', 'D', 'Em', 'C']},
                                  {'name': 'I–V–vi–IV en Re', 'chords': ['D', 'A', 'Bm', 'G']},
                                  {'name': 'I–V–vi–IV en Fa', 'chords': ['F', 'C', 'Dm', 'Bb']}],
                    'laps': 1, 'hints': 'on_error'}),

    ('banda', ADVANCED, 'ii-v-i', 'ii–V–I en cuatro tonalidades',
     'La cadencia básica del jazz, con acordes de séptima, en Do, Fa, Si♭ y Mi♭.',
     'chord_play', {'sequences': [{'name': 'ii–V–I en Do', 'chords': ['Dm7', 'G7', 'Cmaj7']},
                                  {'name': 'ii–V–I en Fa', 'chords': ['Gm7', 'C7', 'Fmaj7']},
                                  {'name': 'ii–V–I en Si♭', 'chords': ['Cm7', 'F7', 'Bbmaj7']},
                                  {'name': 'ii–V–I en Mi♭', 'chords': ['Fm7', 'Bb7', 'Ebmaj7']}],
                    'laps': 1, 'hints': 'on_error'}),
    ('banda', ADVANCED, 'acordes-de-color', 'Disminuidos, aumentados y suspendidos',
     'Acordes de tensión y color para dar variedad a un acompañamiento.',
     'chord_play', {'chords': ['Bdim', 'C#dim', 'F#dim', 'Caug', 'Eaug', 'Dsus4', 'Esus4', 'Asus2', 'Gsus2'],
                    'count': 12, 'hints': 'on_error'}),
    ('banda', ADVANCED, 'blues-12-compases', 'Blues de 12 compases',
     'La forma completa del blues con acordes de séptima, en Do y en Sol.',
     'chord_play', {'sequences': [
         {'name': 'Blues en Do', 'chords': ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7']},
         {'name': 'Blues en Sol', 'chords': ['G7', 'G7', 'G7', 'G7', 'C7', 'C7', 'G7', 'G7', 'D7', 'C7', 'G7', 'D7']}],
         'laps': 1, 'hints': 'on_error'}),
]


def seed(apps, schema_editor):
    LearningPath = apps.get_model('escalas', 'LearningPath')
    Module = apps.get_model('escalas', 'Module')
    paths = {p.slug: p for p in LearningPath.objects.all()}
    for i, (path, level, slug, title, summary, kind, config) in enumerate(MODULES):
        if path not in paths:
            continue
        Module.objects.update_or_create(slug=slug, defaults=dict(
            path=paths[path], level=level, title=title, summary=summary, kind=kind, config=config,
            order=(i % 3 + 1) * 10))


def unseed(apps, schema_editor):
    apps.get_model('escalas', 'Module').objects.filter(
        slug__in=[m[2] for m in MODULES if m[2] != 'clave-de-sol-pentagrama']).delete()


class Migration(migrations.Migration):
    dependencies = [('escalas', '0005_module_levels')]
    operations = [migrations.RunPython(seed, unseed)]
