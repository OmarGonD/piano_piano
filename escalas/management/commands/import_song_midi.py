from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify

from escalas.models import Song
from escalas.song_import import SongImportError, import_midi


class Command(BaseCommand):
    help = ('Carga la versión de una canción para un nivel desde un MIDI o un MusicXML (.mxl/.musicxml). Con --derive, además '
            'genera las versiones de los niveles más fáciles.')

    def add_arguments(self, parser):
        parser.add_argument('song', help='slug de la canción, p. ej. passacaglia')
        parser.add_argument('level', type=int, choices=[1, 2, 3], help='1 básico, 2 intermedio, 3 avanzado')
        parser.add_argument('midi', help='ruta al archivo .mid, .mxl o .musicxml')
        parser.add_argument('--derive', action='store_true',
                            help='genera también los niveles inferiores a partir de este MIDI')
        parser.add_argument('--create-song', metavar='TÍTULO', help='crea la canción si no existe')
        parser.add_argument('--composer', default='', help='compositor, al crear la canción')
        parser.add_argument('--category', default='popular', choices=[c for c, _ in Song.CATEGORIES],
                            help='categoría, al crear la canción')
        parser.add_argument('--rh-track', type=int, help='pista de la mano derecha (0 = primera)')
        parser.add_argument('--lh-track', type=int, help='pista de la mano izquierda')
        parser.add_argument('--split', type=int, default=60,
                            help='sin pistas, las notas >= split van a la derecha (60 = Do central)')
        parser.add_argument('--grid', type=float, default=0.25, help='cuantización en tiempos (0.25 = semicorchea)')
        parser.add_argument('--title', help='título de la versión (por defecto según el nivel)')
        parser.add_argument('--tempo', type=int, help='tempo en BPM (por defecto el del MIDI)')
        parser.add_argument('--key', type=int, help='armadura: -2 = dos bemoles (por defecto la del MIDI)')

    def handle(self, song, level, midi, **o):
        song_obj = Song.objects.filter(slug=song).first()
        if not song_obj:
            if not o['create_song']:
                raise CommandError(f'No existe la canción «{song}». Usa --create-song "Título" para crearla.')
            song_obj = Song.objects.create(slug=slugify(song), title=o['create_song'], composer=o['composer'],
                                           category=o['category'])
        try:
            lines = import_midi(song_obj, level, Path(midi).read_bytes(), o['derive'], o['rh_track'], o['lh_track'],
                                o['split'], o['grid'], o['title'], o['tempo'], o['key'])
        except (OSError, SongImportError) as e:
            raise CommandError(str(e))
        for line in lines:
            self.stdout.write(self.style.SUCCESS(line))
