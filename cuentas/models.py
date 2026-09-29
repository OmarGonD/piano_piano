from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Preferences(models.Model):
    """Preferencias de cada usuario. Si no las ha guardado nunca, valen las de por defecto."""
    SONG_VIEWS = [('staff', _('Partitura')), ('rain', _('Lluvia de notas'))]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preferences')
    song_view = models.CharField(
        _('vista de las canciones'), max_length=10, choices=SONG_VIEWS, default='staff',
        help_text=_('Partitura: las notas en el pentagrama. Lluvia de notas: las notas caen hacia su tecla.'))

    class Meta:
        verbose_name = 'preferencias'
        verbose_name_plural = 'preferencias'

    def __str__(self):
        return f'Preferencias de {self.user}'

    @classmethod
    def of(cls, user):
        """Las del usuario, o unas sin guardar con los valores por defecto."""
        return cls.objects.filter(user=user).first() or cls(user=user)
