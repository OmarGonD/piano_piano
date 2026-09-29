from django.core.management.base import BaseCommand

from escalas import rederive
from escalas.models import SongArrangement


class Command(BaseCommand):
    help = ('Vuelve a generar las versiones básica e intermedia automáticas a partir de la avanzada, con el '
            'algoritmo actual. No toca las versiones escritas a mano.')

    def handle(self, **options):
        self.stdout.write(self.style.SUCCESS(f'{rederive.run(SongArrangement)} versiones regeneradas.'))
