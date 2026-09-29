from django import forms
from django.utils.translation import gettext, gettext_lazy as _
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm

from .models import Preferences

User = get_user_model()


class RegisterForm(UserCreationForm):
    first_name = forms.CharField(label=_('Nombre'), max_length=150)
    email = forms.EmailField(label=_('Correo electrónico'))

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ['username', 'first_name', 'email']

    def clean_email(self):
        email = self.cleaned_data['email'].lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError(gettext('Ya hay una cuenta con este correo.'))
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data['email']
        user.is_active = False  # la activa el administrador a mano
        if commit:
            user.save()
        return user


class LoginForm(AuthenticationForm):
    error_messages = {
        **AuthenticationForm.error_messages,
        'pending': _('Tu cuenta aún no está activada. Cuando la activen podrás entrar.'),
    }

    def clean(self):
        try:
            return super().clean()
        except forms.ValidationError:
            # el backend no autentica cuentas inactivas: distingue "pendiente" de "datos incorrectos"
            user = User.objects.filter(username=self.cleaned_data.get('username')).first()
            if user and not user.is_active and user.check_password(self.cleaned_data.get('password') or ''):
                raise forms.ValidationError(self.error_messages['pending'], code='pending')
            raise


class PreferencesForm(forms.ModelForm):
    class Meta:
        model = Preferences
        fields = ['song_view']
        widgets = {'song_view': forms.RadioSelect}
