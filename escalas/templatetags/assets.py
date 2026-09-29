"""Versiona los scripts con la fecha de cada archivo, para que el navegador no mezcle módulos nuevos y viejos
de su caché después de un cambio."""
import json
import os

from django import template
from django.contrib.staticfiles import finders
from django.templatetags.static import static
from django.utils.html import format_html
from django.utils.safestring import mark_safe

register = template.Library()
JS_DIR = 'escalas/js'


def _versioned(path):
    found = finders.find(path)
    v = int(os.path.getmtime(found)) if found else 0
    return f'{static(path)}?v={v}'


@register.simple_tag
def asset_url(path):
    return _versioned(path)


@register.simple_tag
def js_importmap():
    """Mapa de importación: cada `import './x.js'` entre módulos se resuelve a su URL con versión."""
    folder = finders.find(JS_DIR)
    names = sorted(n for n in os.listdir(folder) if n.endswith('.js')) if folder else []
    imports = {static(f'{JS_DIR}/{n}'): _versioned(f'{JS_DIR}/{n}') for n in names}
    return mark_safe('<script type="importmap">' + json.dumps({'imports': imports}) + '</script>')


@register.simple_tag
def module_script(path):
    return format_html('<script type="module" src="{}"></script>', _versioned(path))


@register.simple_tag
def jsi18n_script():
    """Catálogo de traducciones del JavaScript para el idioma activo. La versión cambia con el archivo .mo
    y con el idioma, para que el navegador no reutilice el de otro idioma."""
    from django.conf import settings
    from django.urls import reverse
    from django.utils import translation
    lang = translation.get_language() or settings.LANGUAGE_CODE
    v = 0
    for base in settings.LOCALE_PATHS:
        mo = os.path.join(base, translation.to_locale(lang), 'LC_MESSAGES', 'djangojs.mo')
        if os.path.exists(mo):
            v = max(v, int(os.path.getmtime(mo)))
    return format_html('<script src="{}?l={}&amp;v={}"></script>', reverse('jsi18n'), lang, v)


@register.filter
def tr(value):
    """Traduce un texto del catálogo guardado en la base de datos (caminos, módulos, escalas…). Si no hay
    traducción, o es un texto que puso un administrador, se muestra tal cual."""
    from django.utils.translation import gettext
    return gettext(value) if value else value
