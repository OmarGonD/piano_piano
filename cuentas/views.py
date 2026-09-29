from django.contrib import messages
from django.contrib.auth import views as auth_views
from django.contrib.auth.decorators import login_not_required
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils.translation import gettext as _

from .forms import LoginForm, PreferencesForm, RegisterForm
from .models import Preferences


@login_not_required
def register(request):
    if request.user.is_authenticated:
        return redirect('escalas:home')
    form = RegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        return render(request, 'cuentas/register.html', {
            'created': user,
            'mail_subject': _('Activar cuenta: %(user)s') % {'user': user.username},
            'mail_body': _('Hola, me registré en la app de piano y quisiera activar mi cuenta.\n\n'
                           'Usuario: %(user)s\nNombre: %(name)s\nCorreo: %(email)s\n')
                         % {'user': user.username, 'name': user.first_name, 'email': user.email},
        })
    return render(request, 'cuentas/register.html', {'form': form})


class LoginView(auth_views.LoginView):
    form_class = LoginForm
    redirect_authenticated_user = True


def preferences(request):
    form = PreferencesForm(request.POST or None, instance=Preferences.of(request.user))
    wants_json = 'application/json' in request.headers.get('Accept', '')
    if request.method == 'POST' and wants_json:  # el cambio rápido desde una canción
        if not form.is_valid():
            return JsonResponse({'errors': form.errors}, status=400)
        form.save()
        return JsonResponse({'song_view': form.instance.song_view})
    if request.method == 'POST' and form.is_valid():
        form.save()
        messages.success(request, _('Preferencias guardadas.'))
        return redirect('preferences')
    return render(request, 'cuentas/preferences.html', {'form': form})
