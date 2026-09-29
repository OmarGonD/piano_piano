from django.db import migrations

BASIC, INTERMEDIATE = 1, 2
PATH = ('primeros-pasos', 'Primeros pasos', 'Empieza aquí si nunca has tocado el piano.',
        'Conoce el teclado, encuentra las notas y toca tus primeras melodías. Después podrás seguir con Solista '
        '(leer partituras) o con Banda (acordes).')

WHITE = [60, 62, 64, 65, 67, 69, 71]
# (nivel, slug, título, resumen, tipo, configuración)
MODULES = [
    (BASIC, 'encuentra-el-do', 'Encuentra el Do',
     'El Do es la tecla blanca justo a la izquierda de cada grupo de dos teclas negras. Búscalo en todo el teclado.',
     'key_finding', {'notes': [48, 60, 72], 'any_octave': True, 'range': [48, 76], 'count': 8, 'hints': 'always'}),
    (BASIC, 'las-siete-notas', 'Las siete notas blancas',
     'Do, Re, Mi, Fa, Sol, La y Si: aprende dónde está cada una a partir del Do central.',
     'key_finding', {'notes': WHITE, 'count': 14, 'hints': 'always'}),
    (BASIC, 'cinco-dedos', 'Cinco notas, cinco dedos',
     'Mano derecha sobre Do, Re, Mi, Fa y Sol con los dedos 1 al 5. Toca la nota que se indica con su dedo.',
     'key_finding', {'notes': [60, 62, 64, 65, 67], 'fingers': [1, 2, 3, 4, 5], 'exact': True, 'count': 15,
                     'hints': 'always'}),
    (BASIC, 'blancas-sin-ayuda', 'Teclas blancas sin ayuda',
     'Ahora la tecla solo se ilumina si te equivocas. Prueba en dos octavas.',
     'key_finding', {'notes': [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76], 'range': [48, 84],
                     'count': 16, 'hints': 'on_error'}),
    (BASIC, 'teclas-negras', 'Las teclas negras',
     'Sostenidos (♯) y bemoles (♭): cada tecla negra tiene dos nombres. Búscalas por su vecina blanca.',
     'key_finding', {'notes': [61, 63, 66, 68, 70], 'range': [48, 84], 'count': 12, 'hints': 'on_error'}),

    (INTERMEDIATE, 'primera-lectura', 'Tu primera lectura: de Do a Sol',
     'Cinco notas en clave de sol, del Do central al Sol, para empezar a leer el pentagrama.',
     'note_reading', {'clef': 'treble', 'low': 60, 'high': 67, 'count': 12}),
    (INTERMEDIATE, 'primera-melodia', 'Tu primera melodía',
     'Frases cortas de cuatro notas que suben y bajan de a poco.',
     'melody_reading', {'clef': 'treble', 'low': 60, 'high': 67, 'length': 4, 'count': 5, 'max_leap': 2}),
    (INTERMEDIATE, 'primeros-acordes', 'Tus primeros acordes: Do y Sol',
     'Toca tres notas a la vez: Do mayor y Sol mayor, con las teclas marcadas.',
     'chord_play', {'chords': ['C', 'G'], 'count': 8, 'hints': 'always'}),
]


def seed(apps, schema_editor):
    LearningPath = apps.get_model('escalas', 'LearningPath')
    Module = apps.get_model('escalas', 'Module')
    slug, name, tagline, desc = PATH
    # «Primeros pasos» va antes que Solista y Banda
    LearningPath.objects.filter(slug='solista').update(order=10)
    LearningPath.objects.filter(slug='banda').update(order=20)
    path, _ = LearningPath.objects.update_or_create(
        slug=slug, defaults=dict(name=name, tagline=tagline, description=desc, order=0))
    for i, (level, mslug, title, summary, kind, config) in enumerate(MODULES):
        Module.objects.update_or_create(slug=mslug, defaults=dict(
            path=path, level=level, title=title, summary=summary, kind=kind, config=config, order=(i + 1) * 10))


def unseed(apps, schema_editor):
    LearningPath = apps.get_model('escalas', 'LearningPath')
    LearningPath.objects.filter(slug=PATH[0]).delete()
    LearningPath.objects.filter(slug='solista').update(order=0)
    LearningPath.objects.filter(slug='banda').update(order=10)


class Migration(migrations.Migration):
    dependencies = [('escalas', '0014_key_finding_kind')]
    operations = [migrations.RunPython(seed, unseed)]
