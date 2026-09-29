from django.contrib import admin
from django.contrib.auth.decorators import login_not_required
from django.urls import include, path
from django.views.i18n import JavaScriptCatalog, set_language

urlpatterns = [
    # el selector de idioma también funciona en las páginas de entrada, antes de iniciar sesión
    path('idioma/', login_not_required(set_language), name='set_language'),
    path('jsi18n/', login_not_required(JavaScriptCatalog.as_view()), name='jsi18n'),
    path('admin/', admin.site.urls),
    path('cuenta/', include('cuentas.urls')),
    path('', include('escalas.urls')),
]
