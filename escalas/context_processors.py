from .models import LearningPath


def nav(request):
    """Sección activa del menú superior y caminos disponibles."""
    match = getattr(request, 'resolver_match', None)
    name, kwargs = (match.url_name, match.kwargs) if match else ('', {})
    active = {
        'home': 'home', 'songs': 'songs', 'song': 'songs', 'index': 'free', 'progress': 'progress',
        'path': kwargs.get('slug'), 'module': kwargs.get('path_slug'),
    }.get(name, '')
    return {'nav_active': active, 'nav_paths': LearningPath.objects.filter(active=True).only('slug', 'name')}
