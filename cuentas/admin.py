from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .models import Preferences

User = get_user_model()


@admin.action(description='Activar cuentas seleccionadas')
def activate(modeladmin, request, queryset):
    n = queryset.filter(is_active=False).update(is_active=True)
    modeladmin.message_user(request, f'{n} cuenta(s) activada(s).', messages.SUCCESS)


@admin.action(description='Desactivar cuentas seleccionadas')
def deactivate(modeladmin, request, queryset):
    n = queryset.filter(is_active=True, is_superuser=False).update(is_active=False)
    modeladmin.message_user(request, f'{n} cuenta(s) desactivada(s).', messages.SUCCESS)


admin.site.unregister(User)


@admin.register(User)
class CuentaAdmin(UserAdmin):
    list_display = ['username', 'first_name', 'email', 'is_active', 'date_joined', 'last_login']
    list_filter = ['is_active', 'is_staff']
    ordering = ['is_active', '-date_joined']  # las pendientes primero
    actions = [activate, deactivate]


@admin.register(Preferences)
class PreferencesAdmin(admin.ModelAdmin):
    list_display = ['user', 'song_view']
    list_filter = ['song_view']
