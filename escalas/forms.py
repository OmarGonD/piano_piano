from django import forms
from django.utils.text import slugify

from .models import Attempt, Song
from django.utils.translation import gettext as _, gettext_lazy


class AttemptForm(forms.ModelForm):
    class Meta:
        model = Attempt
        fields = ['mode', 'config_key', 'title', 'accuracy', 'errors', 'duration', 'bpm', 'timing_ms', 'score']

    def clean_accuracy(self):
        value = self.cleaned_data['accuracy']
        if value > 100:
            raise forms.ValidationError(_('La precisión no puede superar 100.'))
        return value


class SongMidiForm(forms.Form):
    title = forms.CharField(label=gettext_lazy('Nombre de la canción'), max_length=120)
    composer = forms.CharField(label=gettext_lazy('Autor'), max_length=120, required=False)
    category = forms.ChoiceField(label=gettext_lazy('Categoría'), choices=Song.CATEGORIES, initial='popular')
    midi = forms.FileField(label=gettext_lazy('Partitura (MIDI o MusicXML)'))
    rh_track = forms.IntegerField(label=gettext_lazy('Pista mano derecha'), required=False, min_value=0)
    lh_track = forms.IntegerField(label=gettext_lazy('Pista mano izquierda'), required=False, min_value=0)

    def clean_title(self):
        title = self.cleaned_data['title'].strip()
        if not slugify(title):
            raise forms.ValidationError(_('El nombre necesita al menos una letra o un número.'))
        return title

    def clean_midi(self):
        f = self.cleaned_data['midi']
        if f.size > 2 * 1024 * 1024:
            raise forms.ValidationError(_('El archivo no puede pasar de 2 MB.'))
        return f


class SongScoreForm(forms.Form):
    """Sube el MIDI de una canción que ya existe (título y categoría vienen de la canción)."""
    LEVELS = [(3, gettext_lazy('Avanzado: la versión completa (se generan también las demás)')),
              (2, gettext_lazy('Solo el nivel Intermedio, escrito a mano')),
              (1, gettext_lazy('Solo el nivel Básico, escrito a mano'))]
    level = forms.TypedChoiceField(label=gettext_lazy('Qué versión es'), choices=LEVELS, coerce=int, initial=3, required=False, empty_value=3)
    midi = forms.FileField(label=gettext_lazy('Partitura (MIDI o MusicXML)'))
    rh_track = forms.IntegerField(label=gettext_lazy('Pista mano derecha'), required=False, min_value=0)
    lh_track = forms.IntegerField(label=gettext_lazy('Pista mano izquierda'), required=False, min_value=0)

    clean_midi = SongMidiForm.clean_midi
