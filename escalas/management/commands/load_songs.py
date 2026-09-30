import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from escalas.models import Song
from escalas.song_import import SongImportError, import_midi


class Command(BaseCommand):
    help = ('Importa todos los MusicXML de la carpeta songs/ (el nombre del archivo es el slug de la canción) como '
            'versión Avanzada y regenera Intermedio y Básico. Las canciones que no existen se crean con songs/titles.json.')

    def add_arguments(self, parser):
        parser.add_argument('--dir', default=str(Path(settings.BASE_DIR) / 'songs'), help='carpeta con los .mxl')

    def handle(self, dir, **options):
        folder = Path(dir)
        files = sorted(p for p in folder.iterdir() if p.suffix.lower() in ('.mxl', '.musicxml')) if folder.is_dir() else []
        if not files:
            raise CommandError(f'No hay archivos .mxl en {folder}.')
        info_path = folder / 'titles.json'
        info = json.loads(info_path.read_text(encoding='utf-8')) if info_path.exists() else {}
        for path in files:
            slug = path.stem
            song = Song.objects.filter(slug=slug).first()
            if not song:
                meta = info.get(slug)
                if not meta:
                    self.stderr.write(f'{slug}: no existe la canción y falta en titles.json; se omite.')
                    continue
                song = Song.objects.create(slug=slug, title=meta['title'], composer=meta.get('composer', ''),
                                           category=meta.get('category', 'popular'))
            try:
                for line in import_midi(song, 3, path.read_bytes(), derive_lower=True):
                    self.stdout.write(self.style.SUCCESS(line))
            except SongImportError as e:
                self.stderr.write(f'{slug}: {e}')
