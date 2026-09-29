import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Count, Max, Q
from django.utils.translation import gettext, gettext_lazy as _


def _int_list(value, field, lo, hi):
    if not isinstance(value, list) or not value or not all(isinstance(v, int) and lo <= v <= hi for v in value):
        raise ValidationError({field: f'Debe ser una lista de enteros entre {lo} y {hi}.'})


class ScaleType(models.Model):
    FINGERING_CHOICES = [('', 'Sin digitación'), ('major', 'Digitación de escala mayor (mano derecha)')]

    slug = models.SlugField(unique=True)
    name = models.CharField('nombre', max_length=80)
    description = models.CharField(
        'aclaración', max_length=120, blank=True,
        help_text='Se muestra entre paréntesis en el selector, p. ej. «baja natural».')
    intervals = models.JSONField(
        'intervalos', help_text='Semitonos desde la tónica al subir, p. ej. [0, 2, 4, 5, 7, 9, 11].')
    descending = models.JSONField(
        'intervalos al bajar', null=True, blank=True,
        help_text='Solo si difieren de los de subida (menor melódica).')
    letters = models.JSONField(
        'grados de letra', null=True, blank=True,
        help_text='Grado de letra (0–6) de cada nota. Vacío = una letra por nota (escalas de 7 notas).')
    fingering = models.CharField('digitación', max_length=20, choices=FINGERING_CHOICES, blank=True)
    order = models.PositiveSmallIntegerField('orden', default=0)
    active = models.BooleanField('activa', default=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'tipo de escala'
        verbose_name_plural = 'tipos de escala'

    def __str__(self):
        return self.name

    def clean(self):
        _int_list(self.intervals, 'intervals', 0, 11)
        n = len(self.intervals)
        if self.intervals[0] != 0 or self.intervals != sorted(set(self.intervals)):
            raise ValidationError({'intervals': 'Debe empezar en 0 y ser estrictamente creciente.'})
        if self.descending:
            _int_list(self.descending, 'descending', 0, 11)
            if len(self.descending) != n:
                raise ValidationError({'descending': 'Debe tener tantas notas como los intervalos.'})
        if self.letters:
            _int_list(self.letters, 'letters', 0, 6)
            if len(self.letters) != n:
                raise ValidationError({'letters': 'Debe tener tantas notas como los intervalos.'})
        elif n != 7:
            raise ValidationError({'letters': 'Obligatorio para escalas que no tienen 7 notas.'})

    def to_json(self):
        return {
            'slug': self.slug, 'name': gettext(self.name), 'description': gettext(self.description) if self.description else '',
            'intervals': self.intervals, 'descending': self.descending or None,
            'letters': self.letters or None, 'fingering': self.fingering,
        }


class Progression(models.Model):
    KEY_MODES = [('major', 'Mayor'), ('minor', 'Menor')]

    key_mode = models.CharField('tonalidad', max_length=5, choices=KEY_MODES)
    code = models.CharField('código', max_length=40, help_text='Cifrado romano, p. ej. I-vi-IV-V.')
    chords = models.JSONField(
        'acordes',
        help_text='Lista de acordes: {"d": grado 0–6, "s": 1 si lleva séptima, "h": 1 si eleva la sensible}.')
    order = models.PositiveSmallIntegerField('orden', default=0)
    active = models.BooleanField('activa', default=True)

    class Meta:
        ordering = ['key_mode', 'order', 'code']
        constraints = [models.UniqueConstraint(fields=['key_mode', 'code'], name='unique_progression_code')]
        verbose_name = 'círculo armónico'
        verbose_name_plural = 'círculos armónicos'

    def __str__(self):
        return f'{self.code} ({self.get_key_mode_display().lower()})'

    def clean(self):
        if not isinstance(self.chords, list) or not self.chords:
            raise ValidationError({'chords': 'Debe ser una lista con al menos un acorde.'})
        for c in self.chords:
            if not isinstance(c, dict) or not isinstance(c.get('d'), int) or not 0 <= c['d'] <= 6:
                raise ValidationError({'chords': 'Cada acorde necesita "d" entre 0 y 6.'})
            if set(c) - {'d', 's', 'h'}:
                raise ValidationError({'chords': 'Claves permitidas: d, s, h.'})

    @classmethod
    def grouped(cls):
        out = {mode: [] for mode, _ in cls.KEY_MODES}
        for p in cls.objects.filter(active=True):
            out[p.key_mode].append({'id': p.code, 'ch': p.chords})
        return out


class LearningPath(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField('nombre', max_length=60)
    tagline = models.CharField('lema', max_length=120, blank=True)
    description = models.TextField('descripción', blank=True)
    order = models.PositiveSmallIntegerField('orden', default=0)
    active = models.BooleanField('activo', default=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'camino'

    def __str__(self):
        return self.name


CHORD_RE = re.compile(r'^[A-G](#|b)?(maj7|m7|m|7|dim|aug|sus2|sus4)?$')


def _cfg_error(msg):
    raise ValidationError({'config': msg})


def _check_int(cfg, key, lo, hi, default=None):
    value = cfg.get(key, default)
    if not isinstance(value, int) or isinstance(value, bool) or not lo <= value <= hi:
        _cfg_error(f'{key} debe ser un entero entre {lo} y {hi}.')
    return value


def _check_range(cfg):
    low, high = _check_int(cfg, 'low', 21, 108), _check_int(cfg, 'high', 21, 108)
    if high - low < 4:
        _cfg_error('high debe superar a low en al menos 4 semitonos.')
    if not isinstance(cfg.get('accidentals', False), bool):
        _cfg_error('accidentals debe ser true o false.')


def _validate_key_finding(cfg):
    notes = cfg.get('notes')
    if not isinstance(notes, list) or not notes or not all(
            isinstance(n, int) and not isinstance(n, bool) and 21 <= n <= 108 for n in notes):
        _cfg_error('notes debe ser una lista de notas MIDI (21–108).')
    if len({n % 12 for n in notes}) < 2 and not cfg.get('any_octave'):
        _cfg_error('notes necesita al menos dos notas distintas (o any_octave: true).')
    if cfg.get('hints', 'always') not in ('always', 'on_error', 'none'):
        _cfg_error('hints debe ser "always", "on_error" o "none".')
    _check_int(cfg, 'count', 1, 50, 12)
    fingers = cfg.get('fingers')
    if fingers is not None and (not isinstance(fingers, list) or len(fingers) != len(notes)
                                or not all(isinstance(f, int) and 1 <= f <= 5 for f in fingers)):
        _cfg_error('fingers debe tener un dedo (1–5) por cada nota.')
    rng = cfg.get('range')
    if rng is not None and (not isinstance(rng, list) or len(rng) != 2 or rng[1] - rng[0] < 4):
        _cfg_error('range debe ser [grave, agudo] con al menos 4 semitonos.')
    for key in ('exact', 'any_octave'):
        if not isinstance(cfg.get(key, False), bool):
            _cfg_error(f'{key} debe ser true o false.')


def _validate_note_reading(cfg):
    if cfg.get('clef') not in ('treble', 'bass', 'mixed'):
        _cfg_error('clef debe ser "treble", "bass" o "mixed".')
    _check_range(cfg)
    _check_int(cfg, 'count', 1, 100, 15)


def _validate_melody_reading(cfg):
    if cfg.get('clef') not in ('treble', 'bass'):
        _cfg_error('clef debe ser "treble" o "bass".')
    _check_range(cfg)
    _check_int(cfg, 'length', 3, 12, 5)
    _check_int(cfg, 'count', 1, 20, 6)
    _check_int(cfg, 'max_leap', 1, 7, 2)


def _check_chords(chords, where):
    if not isinstance(chords, list) or not chords:
        _cfg_error(f'{where} debe ser una lista de cifrados.')
    bad = [c for c in chords if not isinstance(c, str) or not CHORD_RE.match(c)]
    if bad:
        _cfg_error(f'Cifrados no válidos en {where}: {bad}. Usa p. ej. C, F#m, Bb7, Cmaj7, Bdim, Dsus4.')


def _validate_chord_play(cfg):
    if cfg.get('hints', 'always') not in ('always', 'on_error'):
        _cfg_error('hints debe ser "always" u "on_error".')
    if 'sequences' in cfg:
        seqs = cfg['sequences']
        if not isinstance(seqs, list) or not seqs:
            _cfg_error('sequences debe ser una lista de {"name": ..., "chords": [...]}.')
        for i, seq in enumerate(seqs):
            if not isinstance(seq, dict) or not isinstance(seq.get('name'), str):
                _cfg_error('Cada secuencia necesita "name" y "chords".')
            _check_chords(seq.get('chords'), f'sequences[{i}]')
        _check_int(cfg, 'laps', 1, 8, 1)
    else:
        _check_chords(cfg.get('chords'), 'chords')
        if len(set(cfg['chords'])) < 2:
            _cfg_error('chords necesita al menos dos acordes distintos.')
        _check_int(cfg, 'count', 1, 50, 12)


class Module(models.Model):
    # cada tipo de ejercicio tiene su plantilla (templates/escalas/modules/<kind>.html), su JS y su validador
    KINDS = [('key_finding', 'Encontrar teclas'), ('note_reading', 'Lectura de notas'),
             ('melody_reading', 'Lectura de frases'), ('chord_play', 'Tocar acordes')]
    VALIDATORS = {'key_finding': _validate_key_finding, 'note_reading': _validate_note_reading, 'melody_reading': _validate_melody_reading,
                  'chord_play': _validate_chord_play}

    class Level(models.IntegerChoices):
        BASIC = 1, _('Básico')
        INTERMEDIATE = 2, _('Intermedio')
        ADVANCED = 3, _('Avanzado')

    path = models.ForeignKey(LearningPath, on_delete=models.CASCADE, related_name='modules', verbose_name='camino')
    level = models.PositiveSmallIntegerField('nivel', choices=Level.choices, default=Level.BASIC)
    slug = models.SlugField(unique=True)
    title = models.CharField('título', max_length=120)
    summary = models.CharField('resumen', max_length=240, blank=True)
    kind = models.CharField('tipo de ejercicio', max_length=30, choices=KINDS)
    config = models.JSONField(
        'configuración', default=dict, blank=True,
        help_text='Encontrar teclas: {"notes": [60, 62, 64], "count": 12, "hints": "always|on_error|none", '
                  '"fingers": [1, 2, 3], "exact": false, "any_octave": false}. '
                  'Lectura de notas: {"clef": "treble|bass|mixed", "low": 64, "high": 77, "accidentals": false, '
                  '"count": 15}. Lectura de frases: además "length" y "max_leap" (en grados). '
                  'Acordes: {"chords": ["C", "Am", "G7"], "count": 12, "hints": "always|on_error"} o '
                  '{"sequences": [{"name": "I–V–vi–IV en Do", "chords": ["C", "G", "Am", "F"]}], "laps": 2}.')
    order = models.PositiveSmallIntegerField('orden', default=0)
    active = models.BooleanField('activo', default=True)

    class Meta:
        ordering = ['path', 'level', 'order']
        verbose_name = 'módulo'

    def __str__(self):
        return f'{self.path.name} · {self.title}'

    def clean(self):
        if not isinstance(self.config, dict):
            _cfg_error('Debe ser un objeto JSON.')
        validate = self.VALIDATORS.get(self.kind)
        if validate:
            validate(self.config)

    @property
    def record_key(self):
        return f'module:{self.slug}'


class Song(models.Model):
    CATEGORIES = [('clasica', _('Clásica')), ('cristiana', _('Cristiana')), ('popular', _('Popular'))]

    slug = models.SlugField(unique=True)
    title = models.CharField('título', max_length=120)
    composer = models.CharField('compositor', max_length=120, blank=True)
    category = models.CharField('categoría', max_length=20, choices=CATEGORIES, default='clasica')
    description = models.TextField('descripción', blank=True)
    order = models.PositiveSmallIntegerField('orden', default=0)
    active = models.BooleanField('activa', default=True)
    sections = models.JSONField(
        'partes', default=list, blank=True,
        help_text='Partes de la canción: [{"name": "Coro", "from": 9, "to": 16}, ...] con compases desde 1. '
                  'Se rellenan solas si el MIDI trae marcadores.')

    CHORUS = re.compile(r'coro|estribillo|refr[aá]n|chorus|hook|ritornello', re.I)

    class Meta:
        ordering = ['order', 'title']
        verbose_name = 'canción'
        verbose_name_plural = 'canciones'

    def __str__(self):
        return self.title

    def clean(self):
        ok = isinstance(self.sections, list) and all(
            isinstance(x, dict) and isinstance(x.get('name'), str) and x['name'].strip()
            and all(isinstance(x.get(k), int) and not isinstance(x.get(k), bool) for k in ('from', 'to'))
            and 1 <= x['from'] <= x['to'] for x in self.sections)
        if not ok:
            raise ValidationError({'sections': 'Cada parte necesita "name" y compases "from" ≤ "to" (desde 1).'})

    def sections_json(self):
        return [{**x, 'chorus': bool(self.CHORUS.search(x['name']))} for x in self.sections]


def _check_events(events, hand):
    if not isinstance(events, list):
        raise ValidationError({'notes': f'{hand} debe ser una lista de [inicio, duración, nota].'})
    for ev in events:
        ok = (isinstance(ev, list) and len(ev) == 3
              and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in ev)
              and ev[0] >= 0 and ev[1] > 0 and isinstance(ev[2], int) and 21 <= ev[2] <= 108)
        if not ok:
            raise ValidationError({'notes': f'Evento inválido en {hand}: {ev}. Formato: [inicio en tiempos, '
                                            f'duración en tiempos, nota MIDI 21–108].'})


class SongArrangement(models.Model):
    """Versión de una canción para un nivel. Las notas van por mano como [inicio, duración, nota MIDI],
    con inicio y duración en tiempos (negra = 1). Notas con el mismo inicio suenan juntas."""
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='arrangements', verbose_name='canción')
    level = models.PositiveSmallIntegerField('nivel', choices=Module.Level.choices)
    title = models.CharField('título', max_length=120, help_text='P. ej. «Melodía y bajo».')
    description = models.CharField('descripción', max_length=240, blank=True)
    tempo = models.PositiveSmallIntegerField('tempo (BPM)', default=72)
    beats_per_bar = models.PositiveSmallIntegerField('tiempos por compás', default=4)
    key_fifths = models.SmallIntegerField(
        'armadura', default=0, help_text='Alteraciones de la armadura: negativo = bemoles, positivo = sostenidos.')
    notes = models.JSONField('notas', default=dict, help_text='{"rh": [[0, 1, 67], ...], "lh": [[0, 4, 43], ...]}')
    fingering = models.JSONField(
        'dedos', default=dict, blank=True,
        help_text='Dedo (1 = pulgar … 5 = meñique) de cada nota, en el mismo orden: {"rh": [1, 2, ...], "lh": [...]}. '
                  'Se calcula solo al importar; puedes corregirlo aquí.')

    class Meta:
        ordering = ['song', 'level']
        constraints = [models.UniqueConstraint(fields=['song', 'level'], name='unique_song_level')]
        verbose_name = 'versión'
        verbose_name_plural = 'versiones'

    def __str__(self):
        return f'{self.song.title} · {self.get_level_display()}'

    def clean(self):
        if not -7 <= self.key_fifths <= 7:
            raise ValidationError({'key_fifths': 'Entre -7 y 7.'})
        if not isinstance(self.notes, dict) or set(self.notes) != {'rh', 'lh'}:
            raise ValidationError({'notes': 'Debe tener exactamente las claves "rh" y "lh".'})
        for hand in ('rh', 'lh'):
            _check_events(self.notes[hand], hand)
        if not self.notes['rh'] and not self.notes['lh']:
            raise ValidationError({'notes': 'La versión no tiene notas.'})
        if self.level == Module.Level.BASIC:
            from .arranger import basic_problems
            problems = basic_problems(self.notes, self.key_fifths)
            if problems:
                raise ValidationError({'notes': problems})

    def to_json(self):
        return {'level': self.level, 'label': str(self.get_level_display()), 'title': gettext(self.title),
                'description': gettext(self.description) if self.description else '', 'tempo': self.tempo, 'beats': self.beats_per_bar,
                'key': self.key_fifths, 'notes': self.notes, 'fingering': self.fingering or {}}


class Attempt(models.Model):
    MODES = [('practice', 'Escala'), ('chords', 'Círculo armónico'), ('module', 'Módulo'), ('song', 'Canción')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
                             related_name='attempts', verbose_name='usuario')
    mode = models.CharField('modo', max_length=10, choices=MODES)
    config_key = models.CharField(
        'configuración', max_length=120, db_index=True,
        help_text='Identifica tónica, escala y opciones; agrupa los intentos comparables.')
    title = models.CharField('ejercicio', max_length=120)
    accuracy = models.PositiveSmallIntegerField('precisión (%)')
    errors = models.PositiveIntegerField('errores', default=0)
    duration = models.FloatField('duración (s)', default=0)
    bpm = models.PositiveSmallIntegerField(null=True, blank=True)
    timing_ms = models.FloatField(
        'tiempo (ms)', null=True, blank=True,
        help_text='Escalas con metrónomo: desvío medio respecto al pulso. Módulos de lectura: tiempo medio por nota.')
    score = models.PositiveIntegerField('puntos', null=True, blank=True)
    created_at = models.DateTimeField('fecha', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'intento'

    def __str__(self):
        return f'{self.title}: {self.accuracy}%'

    @classmethod
    def records(cls, user, keys=None):
        """Mejor resultado, intentos y récords de un usuario, por configuración."""
        qs = cls.objects.filter(user=user)
        if keys is not None:
            qs = qs.filter(config_key__in=keys)
        rows = (qs.order_by().values('config_key')
                .annotate(best=Max('accuracy'), runs=Count('id'), score=Max('score'),
                          bpm=Max('bpm', filter=Q(accuracy=100))))
        return {r['config_key']: {'best': r['best'], 'runs': r['runs'], 'bpm': r['bpm'] or 0, 'score': r['score'] or 0}
                for r in rows}
