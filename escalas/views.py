import json

from django.contrib import messages
from django.contrib.auth.decorators import login_not_required, user_passes_test
from django.contrib.auth.views import redirect_to_login
from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.text import slugify
from django.views.decorators.http import require_POST

from cuentas.models import Preferences

from .access import PUBLIC_PATHS
from .forms import AttemptForm, SongMidiForm, SongScoreForm
from .models import Attempt, LearningPath, Module, Progression, ScaleType, Song
from .song_import import SongImportError, import_midi
from django.utils.translation import gettext, gettext as _


def _records(request, keys=None):
    """Récords del usuario; sin sesión no hay ninguno."""
    return Attempt.records(request.user, keys) if request.user.is_authenticated else {}


@login_not_required
def home(request):
    paths = LearningPath.objects.filter(active=True).annotate(
        module_count=Count('modules', filter=Q(modules__active=True))).order_by('order', 'name')  # con annotate se pierde el orden del modelo
    return render(request, 'escalas/home.html', {'paths': paths})


@login_not_required
def path_detail(request, slug):
    lpath = get_object_or_404(LearningPath, slug=slug, active=True)
    modules = list(lpath.modules.filter(active=True))
    records = _records(request, [m.record_key for m in modules])
    levels = []
    for number, m in enumerate(modules, 1):
        m.number = number
        m.record = records.get(m.record_key)
        if not levels or levels[-1]['value'] != m.level:
            levels.append({'value': m.level, 'label': m.get_level_display(), 'modules': []})
        levels[-1]['modules'].append(m)
    for lv in levels:
        lv['done'] = sum(1 for m in lv['modules'] if m.record and m.record['best'] == 100)
    return render(request, 'escalas/path.html', {'path': lpath, 'levels': levels})


# JS de cada tipo de ejercicio
SCRIPTS = {'key_finding': 'keyfinding.js', 'note_reading': 'reading.js', 'melody_reading': 'melody.js', 'chord_play': 'chordplay.js'}


@login_not_required
def module_detail(request, path_slug, slug):
    module = get_object_or_404(Module.objects.select_related('path'), slug=slug, path__slug=path_slug,
                               active=True, path__active=True)
    if not request.user.is_authenticated and module.path.slug not in PUBLIC_PATHS:
        return redirect_to_login(request.get_full_path())
    siblings = list(module.path.modules.filter(active=True))
    idx = siblings.index(module)
    return render(request, f'escalas/modules/{module.kind}.html', {
        'module': module,
        'script': SCRIPTS[module.kind],
        'number': idx + 1,
        'next_module': siblings[idx + 1] if idx + 1 < len(siblings) else None,
        'module_json': {'slug': module.slug, 'title': gettext(module.title), 'key': module.record_key,
                        'config': module.config},
        'records': _records(request, [module.record_key]),
    })


HANDS = ['rh', 'lh', 'both']


def song_keys(song):
    return [f'song:{song.slug}:{a.level}:{h}' for a in song.arrangements.all() for h in HANDS]


def songs(request):
    all_songs = Song.objects.filter(active=True)
    counts = dict(all_songs.order_by().values_list('category').annotate(n=Count('id')))
    categories = [{'value': c, 'label': label, 'count': counts[c]} for c, label in Song.CATEGORIES if counts.get(c)]
    current = request.GET.get('categoria', '')
    if current not in counts:
        current = ''
    items = list((all_songs.filter(category=current) if current else all_songs).prefetch_related('arrangements'))
    records = Attempt.records(request.user, [k for s in items for k in song_keys(s)])
    for s in items:
        s.levels = [{'label': a.get_level_display(), 'value': a.level,
                     'best': max((records.get(f'song:{s.slug}:{a.level}:{h}', {}).get('best', 0) for h in HANDS),
                                  default=0)} for a in s.arrangements.all()]
    return render(request, 'escalas/songs.html', {
        'songs': items, 'categories': categories, 'current': current, 'total': sum(counts.values()),
        'midi_form': SongMidiForm() if request.user.is_superuser else None})


def song_detail(request, slug):
    song = get_object_or_404(Song.objects.prefetch_related('arrangements'), slug=slug, active=True)
    return render(request, 'escalas/song.html', {
        'song': song,
        'song_json': {'slug': song.slug, 'title': gettext(song.title), 'sections': song.sections_json(),
                      # el superusuario tiene todos los pasos abiertos para probar las canciones
                      'unlock_all': request.user.is_superuser,
                      'view': Preferences.of(request.user).song_view,
                      'arrangements': [a.to_json() for a in song.arrangements.all()]},
        'records': Attempt.records(request.user, song_keys(song)),
        'score_form': SongScoreForm() if request.user.is_superuser else None,
    })


@require_POST
@user_passes_test(lambda u: u.is_superuser)
def song_upload_midi(request):
    """Crea una canción (o reemplaza la del mismo nombre) con sus tres niveles a partir de un MIDI."""
    form = SongMidiForm(request.POST, request.FILES)
    if not form.is_valid():
        for errors in form.errors.values():
            for e in errors:
                messages.error(request, e)
        return redirect('escalas:songs')
    d = form.cleaned_data
    try:
        with transaction.atomic():  # si el MIDI no vale, no queda una canción vacía
            song, created = Song.objects.get_or_create(
                slug=slugify(d['title']), defaults={'title': d['title'], 'category': d['category']})
            if not created:
                song.title, song.category, song.active = d['title'], d['category'], True
            song.composer = d['composer'] or song.composer
            song.save()
            lines = import_midi(song, 3, d['midi'].read(), True, d['rh_track'], d['lh_track'])
    except SongImportError as e:
        messages.error(request, str(e))
        return redirect('escalas:songs')
    messages.success(request, (_('Canción creada: %(title)s.') if created else _('Canción actualizada: %(title)s.'))
                     % {'title': song.title})
    for line in lines:
        messages.success(request, line)
    return redirect('escalas:song', slug=song.slug)


@require_POST
@user_passes_test(lambda u: u.is_superuser)
def song_upload_score(request, slug):
    """Carga (o reemplaza) la partitura MIDI de una canción existente."""
    song = get_object_or_404(Song, slug=slug)
    form = SongScoreForm(request.POST, request.FILES)
    if not form.is_valid():
        for errors in form.errors.values():
            for e in errors:
                messages.error(request, e)
        return redirect('escalas:song', slug=slug)
    d = form.cleaned_data
    try:
        with transaction.atomic():
            lines = import_midi(song, d['level'], d['midi'].read(), d['level'] == 3, d['rh_track'], d['lh_track'])
    except SongImportError as e:
        messages.error(request, str(e))
        return redirect('escalas:song', slug=slug)
    messages.success(request, _('Partitura cargada: %(title)s.') % {'title': song.title})
    for line in lines:
        messages.success(request, line)
    return redirect('escalas:song', slug=slug)


def index(request):
    return render(request, 'escalas/index.html', {
        'scale_types': [t.to_json() for t in ScaleType.objects.filter(active=True)],
        'progressions': Progression.grouped(),
        'records': Attempt.records(request.user),
    })


def progress(request):
    summary = (request.user.attempts.order_by().values('title', 'config_key')
               .annotate(best=Max('accuracy'), runs=Count('id'), last=Max('created_at'))
               .order_by('-last'))
    return render(request, 'escalas/progress.html', {
        'summary': summary,
        'recent': request.user.attempts.all()[:50],
    })


@require_POST
@login_not_required
def create_attempt(request):
    if not request.user.is_authenticated:  # sin cuenta se practica, pero el avance no se guarda
        return JsonResponse({'saved': False}, status=401)
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({'error': _('JSON inválido.')}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({'error': _('Se esperaba un objeto JSON.')}, status=400)
    form = AttemptForm(data)
    if not form.is_valid():
        return JsonResponse({'errors': form.errors}, status=400)
    attempt = form.save(commit=False)
    attempt.user = request.user
    attempt.save()
    record = Attempt.records(request.user, [attempt.config_key])[attempt.config_key]
    return JsonResponse({'id': attempt.pk, 'record': record}, status=201)
