"""Passacaglia básica sin alteraciones y La Maritza (pendiente de MIDI).

La versión básica pasa a la menor, solo con teclas blancas: el mismo ciclo de quintas
(Lam – Rem – Sol – Do – Fa – Si° – Mim – Lam) con el acorde de dominante en menor natural.
"""
from django.db import migrations

# Por compás: voces de la mano derecha (media, aguda) y bajo.
BASIC_BARS = [
    ('Lam', 72, 76, 45),
    ('Rem', 74, 77, 50),
    ('Sol', 71, 74, 43),
    ('Do', 72, 76, 48),
    ('Fa', 72, 77, 41),
    ('Si°', 74, 77, 47),
    ('Mim', 71, 76, 52),
    ('Lam', 72, 69, 45),   # termina bajando a la tónica
]


def basic_notes():
    rh, lh = [], []
    for b, (_, first, second, bass) in enumerate(BASIC_BARS):
        t = b * 4
        rh += [[t, 2, first], [t + 2, 2, second]]
        lh.append([t, 4, bass])
    return {'rh': rh, 'lh': lh}


def forwards(apps, schema_editor):
    Song = apps.get_model('escalas', 'Song')
    SongArrangement = apps.get_model('escalas', 'SongArrangement')
    SongArrangement.objects.filter(song__slug='passacaglia', level=1).update(
        key_fifths=0, notes=basic_notes(), title='Melodía y bajo en la menor',
        description='Solo teclas blancas: dos blancas por compás en la derecha y una redonda en la izquierda.')
    Song.objects.update_or_create(slug='la-maritza', defaults=dict(
        title='La Maritza', composer='Jean Renard y Pierre Delanoë (canta Sylvie Vartan)',
        description='Canción de 1968 con derechos de autor vigentes: importa tu partitura en MIDI y la app '
                    'crea las tres versiones.',
        order=20))


def backwards(apps, schema_editor):
    apps.get_model('escalas', 'Song').objects.filter(slug='la-maritza').delete()


class Migration(migrations.Migration):
    dependencies = [('escalas', '0008_seed_passacaglia')]
    operations = [migrations.RunPython(forwards, backwards)]
