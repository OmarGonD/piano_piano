import json

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse

from .models import Attempt, LearningPath, Module, Progression, ScaleType, Song, SongArrangement


class LoggedInTestCase(TestCase):
    """Toda la app requiere sesión: cada test entra con un usuario activo."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        self.user = get_user_model().objects.create_user('ana', password='clave-segura-123')
        self.client.force_login(self.user)


class CatalogTests(LoggedInTestCase):
    def test_seed_loads_scales_and_progressions(self):
        self.assertTrue(ScaleType.objects.filter(slug='major', fingering='major').exists())
        grouped = Progression.grouped()
        self.assertEqual(len(grouped['major']), 4)
        self.assertEqual(len(grouped['minor']), 4)

    def test_scale_validation(self):
        ScaleType(slug='ok', name='Blues', intervals=[0, 3, 5, 6, 7, 10], letters=[0, 2, 3, 3, 4, 6]).full_clean()
        with self.assertRaises(ValidationError):
            ScaleType(slug='bad', name='Mal', intervals=[0, 3, 5, 7, 10]).full_clean()  # 5 notas sin letras
        with self.assertRaises(ValidationError):
            ScaleType(slug='bad2', name='Mal', intervals=[2, 4, 5, 7, 9, 11, 12]).full_clean()

    def test_progression_validation(self):
        with self.assertRaises(ValidationError):
            Progression(key_mode='major', code='X', chords=[{'d': 9}]).full_clean()


class ViewTests(LoggedInTestCase):
    def test_index_embeds_catalog(self):
        res = self.client.get(reverse('escalas:index'))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'id="scale-types"')
        self.assertContains(res, '"slug": "pentaMin"')
        self.assertContains(res, 'escalas/js/main.js')

    def test_progress_page(self):
        Attempt.objects.create(user=self.user, mode='practice', config_key='0-major-1-updown-n', title='Do mayor',
                               accuracy=90)
        res = self.client.get(reverse('escalas:progress'))
        self.assertContains(res, 'Do mayor')

    def post(self, data, **kw):
        return self.client.post(reverse('escalas:create_attempt'), json.dumps(data),
                                content_type='application/json', **kw)

    def test_create_attempt_returns_aggregated_record(self):
        base = {'mode': 'practice', 'config_key': 'k', 'title': 'Do mayor', 'errors': 0, 'duration': 5.2}
        self.post({**base, 'accuracy': 80, 'bpm': 90})
        self.post({**base, 'accuracy': 100, 'bpm': 72})
        res = self.post({**base, 'accuracy': 100})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['record'], {'best': 100, 'runs': 3, 'bpm': 72, 'score': 0})

    def test_create_attempt_rejects_invalid(self):
        res = self.post({'mode': 'practice', 'config_key': 'k', 'title': 'x', 'accuracy': 150})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.post(reverse('escalas:create_attempt'), 'no-json',
                                          content_type='application/json').status_code, 400)

    def test_create_attempt_requires_csrf(self):
        from django.test import Client
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        res = client.post(reverse('escalas:create_attempt'), '{}', content_type='application/json')
        self.assertEqual(res.status_code, 403)


class PathTests(LoggedInTestCase):
    def test_home_lists_both_paths(self):
        res = self.client.get(reverse('escalas:home'))
        self.assertContains(res, 'Solista')
        self.assertContains(res, 'Banda')
        self.assertContains(res, '9 módulos', count=2)

    def test_solista_has_first_module_with_record(self):
        module = Module.objects.get(slug='clave-de-sol-pentagrama')
        Attempt.objects.create(user=self.user, mode='module', config_key=module.record_key, title=module.title,
                               accuracy=87)
        res = self.client.get(reverse('escalas:path', args=['solista']))
        self.assertContains(res, module.title)
        self.assertContains(res, '87%')

    def test_module_page_embeds_config(self):
        res = self.client.get(reverse('escalas:module', args=['solista', 'clave-de-sol-pentagrama']))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'id="module"')
        self.assertContains(res, '"clef": "treble"')
        self.assertContains(res, 'escalas/js/reading.js')

    def test_module_must_belong_to_path(self):
        res = self.client.get(reverse('escalas:module', args=['banda', 'clave-de-sol-pentagrama']))
        self.assertEqual(res.status_code, 404)

    def test_module_config_validation(self):
        path = LearningPath.objects.get(slug='solista')
        ok = Module(path=path, slug='x', title='X', kind='note_reading',
                    config={'clef': 'bass', 'low': 43, 'high': 57})
        ok.full_clean()
        bad = Module(path=path, slug='y', title='Y', kind='note_reading',
                     config={'clef': 'alto', 'low': 43, 'high': 57})
        with self.assertRaises(ValidationError):
            bad.full_clean()


class LevelTests(LoggedInTestCase):
    def test_each_path_has_three_modules_per_level(self):
        for slug in ('solista', 'banda'):
            levels = Module.objects.filter(path__slug=slug).values_list('level', flat=True)
            self.assertEqual(sorted(levels), [1, 1, 1, 2, 2, 2, 3, 3, 3], slug)

    def test_seeded_configs_are_valid(self):
        for m in Module.objects.all():
            m.full_clean()

    def test_path_page_groups_by_level(self):
        res = self.client.get(reverse('escalas:path', args=['banda']))
        content = res.content.decode()
        self.assertLess(content.index('Básico'), content.index('Intermedio'))
        self.assertLess(content.index('Intermedio'), content.index('Avanzado'))
        self.assertContains(res, 'Blues de 12 compases')

    def test_every_module_page_renders_with_its_script(self):
        scripts = {'key_finding': 'keyfinding.js', 'note_reading': 'reading.js', 'melody_reading': 'melody.js', 'chord_play': 'chordplay.js'}
        for m in Module.objects.select_related('path'):
            res = self.client.get(reverse('escalas:module', args=[m.path.slug, m.slug]))
            self.assertEqual(res.status_code, 200, m.slug)
            self.assertContains(res, f'type="module" src="/static/escalas/js/{scripts[m.kind]}?v=')

    def test_chord_and_melody_validation(self):
        path = LearningPath.objects.get(slug='banda')
        bad_chord = Module(path=path, slug='a', title='A', kind='chord_play', config={'chords': ['C', 'Hm']})
        with self.assertRaises(ValidationError):
            bad_chord.full_clean()
        one_chord = Module(path=path, slug='b', title='B', kind='chord_play', config={'chords': ['C', 'C']})
        with self.assertRaises(ValidationError):
            one_chord.full_clean()
        seq = Module(path=path, slug='c', title='C', kind='chord_play',
                     config={'sequences': [{'name': 'x', 'chords': ['Dm7', 'G7', 'Cmaj7']}], 'laps': 2})
        seq.full_clean()
        melody = Module(path=path, slug='d', title='D', kind='melody_reading',
                        config={'clef': 'treble', 'low': 60, 'high': 79, 'length': 20})
        with self.assertRaises(ValidationError):
            melody.full_clean()


def build_midi(tracks, division=480, tempo_us=600000, key=-2):
    """MIDI tipo 1 mínimo. tracks: listas de (inicio_en_tiempos, duración, nota)."""
    import struct

    def vlq(n):
        out = [n & 0x7F]
        while n > 0x7F:
            n >>= 7
            out.insert(0, (n & 0x7F) | 0x80)
        return bytes(out)

    chunks = []
    for ti, notes in enumerate(tracks):
        evs = []
        if ti == 0:
            evs += [(0, b'\xff\x51\x03' + tempo_us.to_bytes(3, 'big')),
                    (0, b'\xff\x58\x04\x03\x02\x18\x08'),
                    (0, b'\xff\x59\x02' + struct.pack('b', key) + b'\x01')]
        for t, d, m in notes:
            evs += [(round(t * division), bytes([0x90, m, 80])), (round((t + d) * division), bytes([0x80, m, 0]))]
        evs.sort(key=lambda e: e[0])
        body, last = b'', 0
        for tick, data in evs:
            body += vlq(tick - last) + data
            last = tick
        body += b'\x00\xff\x2f\x00'
        chunks.append(b'MTrk' + struct.pack('>I', len(body)) + body)
    return b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks), division) + b''.join(chunks)


class SongTests(LoggedInTestCase):
    def test_passacaglia_has_three_valid_levels(self):
        song = Song.objects.get(slug='passacaglia')
        arrs = list(song.arrangements.all())
        self.assertEqual([a.level for a in arrs], [1, 2, 3])
        for a in arrs:
            a.full_clean()
            self.assertTrue(a.notes['rh'] and a.notes['lh'])
        self.assertEqual([a.key_fifths for a in arrs], [0, -2, -2])  # la básica, sin armadura
        # cada nivel es más denso que el anterior
        sizes = [len(a.notes['rh']) + len(a.notes['lh']) for a in arrs]
        self.assertEqual(sizes, sorted(sizes))

    def test_songs_pages(self):
        self.assertContains(self.client.get(reverse('escalas:home')), reverse('escalas:songs'))
        res = self.client.get(reverse('escalas:songs'))
        self.assertContains(res, 'Passacaglia')
        res = self.client.get(reverse('escalas:song', args=['passacaglia']))
        self.assertContains(res, 'id="song"')
        self.assertContains(res, 'type="module" src="/static/escalas/js/song.js?v=')
        self.assertContains(res, '"key": -2')

    def test_arrangement_validation(self):
        song = Song.objects.get(slug='passacaglia')
        bad = SongArrangement(song=song, level=1, title='x', notes={'rh': [[0, 0, 60]], 'lh': []})
        with self.assertRaises(ValidationError):
            bad.full_clean()
        with self.assertRaises(ValidationError):
            SongArrangement(song=song, level=1, title='x', notes={'rh': []}).full_clean()

    def test_song_attempt_records_best_score(self):
        key = 'song:passacaglia:1:rh'
        for acc, score in [(70, 300), (90, 250)]:
            res = self.client.post(reverse('escalas:create_attempt'), json.dumps(
                {'mode': 'song', 'config_key': key, 'title': 'P', 'accuracy': acc, 'errors': 1, 'duration': 30,
                 'score': score}),
                content_type='application/json')
        self.assertEqual(res.json()['record'], {'best': 90, 'runs': 2, 'bpm': 0, 'score': 300})
        self.assertContains(self.client.get(reverse('escalas:songs')), 'Básico · 90%')

    def test_import_song_midi(self):
        import tempfile
        from pathlib import Path
        from django.core.management import call_command
        rh = [(0, 1, 67), (1, 1, 70), (2, 0.5, 74), (2.5, 1.5, 79)]
        lh = [(0, 4, 43)]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'p.mid'
            path.write_bytes(build_midi([rh, lh]))
            call_command('import_song_midi', 'passacaglia', '3', str(path), stdout=open(Path(d) / 'out', 'w'))
            arr = SongArrangement.objects.get(song__slug='passacaglia', level=3)
            self.assertEqual(arr.notes['rh'], [[0, 1, 67], [1, 1, 70], [2, 0.5, 74], [2.5, 1.5, 79]])
            self.assertEqual(arr.notes['lh'], [[0, 4, 43]])
            self.assertEqual((arr.tempo, arr.beats_per_bar, arr.key_fifths), (100, 3, -2))
            # por pistas, aunque las alturas crucen el Do central
            path.write_bytes(build_midi([[(0, 1, 55)], [(0, 1, 62)]]))
            call_command('import_song_midi', 'passacaglia', '3', str(path), '--rh-track', '0', '--lh-track', '1',
                         stdout=open(Path(d) / 'out', 'w'))
            arr.refresh_from_db()
            self.assertEqual((arr.notes['rh'], arr.notes['lh']), ([[0, 1, 55]], [[0, 1, 62]]))
            # dos pistas con notas: cada una es una mano (la más aguda, la derecha) aunque crucen el Do central
            path.write_bytes(build_midi([[(0, 1, 57), (1, 1, 72)], [(0, 1, 40), (1, 1, 64)]]))
            call_command('import_song_midi', 'passacaglia', '3', str(path), stdout=open(Path(d) / 'out', 'w'))
            arr.refresh_from_db()
            self.assertEqual((arr.notes['rh'], arr.notes['lh']), ([[0, 1, 57], [1, 1, 72]], [[0, 1, 40], [1, 1, 64]]))

    def test_upload_midi_web(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        url = reverse('escalas:song_upload_midi')
        midi = lambda: SimpleUploadedFile('p.mid', build_midi([[(0, 1, 67), (1, 1, 72)], [(0, 2, 48)]]))
        songs = reverse('escalas:songs')
        # un usuario normal no ve el formulario ni puede subir
        self.assertNotContains(self.client.get(songs), 'Agregar canción desde MIDI o MusicXML')
        self.client.post(url, {'title': 'Nueva', 'category': 'popular', 'midi': midi()})
        self.assertFalse(Song.objects.filter(slug='nueva').exists())
        self.user.is_superuser = True
        self.user.save()
        self.assertContains(self.client.get(songs), 'Agregar canción desde MIDI o MusicXML')
        res = self.client.post(url, {'title': 'Nueva canción', 'composer': 'Autor', 'category': 'popular',
                                     'midi': midi()}, follow=True)
        self.assertRedirects(res, reverse('escalas:song', args=['nueva-cancion']))
        self.assertContains(res, 'Canción creada')
        song = Song.objects.get(slug='nueva-cancion')
        self.assertEqual((song.title, song.composer), ('Nueva canción', 'Autor'))
        arrs = {a.level: a for a in song.arrangements.all()}
        self.assertEqual(set(arrs), {1, 2, 3})
        self.assertEqual(arrs[3].notes, {'rh': [[0, 1, 67], [1, 1, 72]], 'lh': [[0, 2, 48]]})
        # mismo nombre: se reemplaza; sin autor, se conserva el anterior
        res = self.client.post(url, {'title': 'Nueva canción', 'category': 'popular', 'midi': midi()}, follow=True)
        self.assertContains(res, 'Canción actualizada')
        self.assertEqual(Song.objects.get(slug='nueva-cancion').composer, 'Autor')
        # un MIDI inválido no deja una canción vacía
        res = self.client.post(url, {'title': 'Rota', 'category': 'popular',
                                     'midi': SimpleUploadedFile('x.mid', b'no es midi')}, follow=True)
        self.assertContains(res, 'data-kind="error"')
        self.assertFalse(Song.objects.filter(slug='rota').exists())

class BasicLevelAndDeriveTests(LoggedInTestCase):
    # un fragmento "completo" en sol menor: corcheas, acordes en la derecha, Fa# y bemoles
    FULL = {
        'rh': [[0, 0.5, 67], [0, 0.5, 70], [0.5, 0.5, 74], [1, 0.5, 78], [1.5, 0.5, 75], [2, 1, 79], [3, 1, 70],
               [4, 2, 72], [4, 2, 75], [6, 2, 74]],
        'lh': [[0, 1, 43], [1, 1, 50], [2, 2, 46], [4, 4, 48]],
    }

    def test_basic_rules(self):
        from .arranger import basic_problems
        self.assertEqual(basic_problems({'rh': [[0, 1, 60], [1, 2, 64]], 'lh': [[0, 4, 48]]}, 0), [])
        problems = ' '.join(basic_problems(self.FULL, -2))
        for text in ('armadura', 'derecha tiene teclas negras', 'derecha tiene notas más cortas',
                     'derecha toca varias notas', 'izquierda tiene teclas negras'):
            self.assertIn(text, problems)
        self.assertNotIn('izquierda tiene notas más cortas', problems)
        song = Song.objects.get(slug='passacaglia')
        with self.assertRaises(ValidationError):
            SongArrangement(song=song, level=1, title='x', key_fifths=-2, notes=self.FULL).full_clean()

    def test_derived_levels_are_valid(self):
        from .arranger import basic_problems, derive
        basic, key = derive(self.FULL, -2, 4, 1)
        self.assertEqual(key, 0)
        self.assertEqual(basic_problems(basic, key), [])
        # sol menor pasa a la menor: la melodía empieza en Si♭4 (lo más agudo del acorde) y queda en Do5
        self.assertEqual(basic['rh'][0], [0, 1, 72])
        inter, key2 = derive(self.FULL, -2, 4, 2)
        self.assertEqual(key2, -2)
        self.assertTrue(all(d >= 0.5 for _, d, _ in inter['rh']))
        # el bajo sigue al de la versión completa y late a negras alternando fundamental y quinta
        self.assertEqual(inter['lh'], [[0, 1, 43], [1, 1, 50], [2, 1, 46], [3, 1, 53], [4, 1, 48], [5, 1, 55],
                                       [6, 1, 48], [7, 1, 55]])
        # en la básica, la fundamental de cada medio compás (las iguales se unen)
        self.assertEqual([n[0] for n in basic['lh']], [0, 2, 4])

    def test_melody_keeps_the_notes_that_carry_the_tune(self):
        from .arranger import simplify_rhythm
        # dos corcheas por tiempo: se conserva la que cae en el tiempo, no la de paso
        line = [[0, .5, 60], [.5, .5, 72], [1, .5, 62], [1.5, .5, 74]]
        self.assertEqual(simplify_rhythm(line, 1), [[0, 1, 60], [1, 1, 62]])
        # sin nota en el tiempo, gana la más larga
        line = [[.25, .25, 60], [.5, 1, 65]]
        self.assertEqual(simplify_rhythm(line, 1)[0][2], 65)

    def test_import_with_derive_creates_song_and_three_levels(self):
        import tempfile
        from pathlib import Path
        from django.core.management import call_command
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'full.mid'
            path.write_bytes(build_midi([[tuple(n) for n in self.FULL['rh']], [tuple(n) for n in self.FULL['lh']]]))
            call_command('import_song_midi', 'mi-cancion', '3', str(path), '--derive',
                         '--create-song', 'Mi canción', stdout=open(Path(d) / 'out', 'w'))
        song = Song.objects.get(slug='mi-cancion')
        arrs = {a.level: a for a in song.arrangements.all()}
        self.assertEqual(sorted(arrs), [1, 2, 3])
        self.assertEqual((arrs[1].key_fifths, arrs[3].key_fifths), (0, -2))
        self.assertLess(arrs[1].tempo, arrs[3].tempo)
        for a in arrs.values():
            a.full_clean()

    def test_maritza_waits_for_midi(self):
        res = self.client.get(reverse('escalas:songs'))
        self.assertContains(res, 'La Maritza')
        self.assertContains(res, 'Falta la partitura')
        res = self.client.get(reverse('escalas:song', args=['la-maritza']))
        self.assertContains(res, 'Esta canción aún no tiene partitura')
        self.assertNotContains(res, 'type="file"')  # solo el administrador ve el selector de MIDI
        self.assertNotContains(res, 'type="module"')

    def test_midi_markers_become_sections(self):
        import struct
        from django.core.files.uploadedfile import SimpleUploadedFile
        data = bytearray(build_midi([[(0, 3, 67), (3, 3, 72), (6, 3, 74), (9, 3, 72)], [(0, 12, 48)]]))
        # marcadores en el primer track (compás de 3 tiempos, división 480): «Estrofa» en el compás 1 y «Coro» en el 3
        def marker(tick, text):
            return tick, b'\xff\x06' + bytes([len(text)]) + text
        from .midi_import import to_arrangement
        parsed = to_arrangement(bytes(data))
        self.assertEqual(parsed['sections'], [])  # sin marcadores no se inventa nada
        # se inserta un track extra solo con marcadores
        def vlq(n):
            out = [n & 0x7F]
            while n > 0x7F:
                n >>= 7
                out.insert(0, (n & 0x7F) | 0x80)
            return bytes(out)
        body, last = b'', 0
        for tick, ev in [marker(0, b'Estrofa'), marker(6 * 480, b'Coro')]:
            body += vlq(tick - last) + ev
            last = tick
        body += b'\x00\xff\x2f\x00'
        data[10:12] = struct.pack('>H', 3)
        data += b'MTrk' + struct.pack('>I', len(body)) + body
        parsed = to_arrangement(bytes(data))
        self.assertEqual(parsed['sections'], [{'name': 'Estrofa', 'from': 1, 'to': 2}, {'name': 'Coro', 'from': 3, 'to': 4}])
        self.user.is_superuser = True
        self.user.save()
        self.client.post(reverse('escalas:song_upload_score', args=['la-maritza']),
                         {'midi': SimpleUploadedFile('p.mid', bytes(data))})
        song = Song.objects.get(slug='la-maritza')
        self.assertEqual([(x['name'], x['chorus']) for x in song.sections_json()], [('Estrofa', False), ('Coro', True)])
        res = self.client.get(reverse('escalas:song', args=['la-maritza']))
        self.assertContains(res, '"chorus": true')

    def test_musicxml_import(self):
        import io, zipfile
        from .musicxml_import import parse_musicxml
        def note(step, octave, dur, staff, extra=''):
            return (f'<note><pitch><step>{step}</step><octave>{octave}</octave></pitch><duration>{dur}</duration>'
                    f'{extra}<staff>{staff}</staff></note>')
        def measure(n, body, extra=''):
            return f'<measure number="{n}">{extra}{body}</measure>'
        attrs = ('<attributes><divisions>2</divisions><key><fifths>-1</fifths></key><time><beats>3</beats>'
                 '<beat-type>4</beat-type></time><staves>2</staves></attributes>'
                 '<direction><direction-type><rehearsal>Coro</rehearsal></direction-type><sound tempo="90"/></direction>')
        ms = [
            measure(1, note('C', 5, 6, 1, '<tie type="start"/>') + '<backup><duration>6</duration></backup>' + note('C', 3, 6, 2), attrs),
            measure(2, note('C', 5, 2, 1, '<tie type="stop"/>') + note('D', 5, 4, 1) + '<backup><duration>6</duration></backup>' + note('G', 3, 6, 2),
                    '<barline><repeat direction="backward"/></barline>'),
        ]
        xml = ('<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'
               '<part id="P1">' + ''.join(ms) + '</part></score-partwise>').encode()
        r = parse_musicxml(xml)
        # el compás 1-2 se repite (barra de repetición): 4 compases; la ligadura une 3 + 1 tiempos
        self.assertEqual((r['tempo'], r['beats_per_bar'], r['key_fifths']), (90, 3, -1))
        self.assertEqual(r['notes']['rh'][0], [0, 4, 72])
        self.assertEqual([n[2] for n in r['notes']['lh']], [48, 55, 48, 55])
        self.assertEqual(r['notes']['rh'][-1], [10, 2, 74])
        # la marca se repite con la repetición: cada vuelta es una parte
        self.assertEqual(r['sections'], [{'name': 'Coro', 'from': 1, 'to': 2}, {'name': 'Coro', 'from': 3, 'to': 4}])
        # el mismo contenido dentro de un .mxl
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="s.xml"/></rootfiles></container>')
            z.writestr('s.xml', xml)
        self.assertEqual(parse_musicxml(buf.getvalue())['notes'], r['notes'])
        with self.assertRaises(Exception):
            parse_musicxml(b'<?xml version="1.0"?><nada/>')

    def test_upload_score_from_song_page(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        url = reverse('escalas:song_upload_score', args=['la-maritza'])
        midi = lambda: SimpleUploadedFile('p.mid', build_midi([[(0, 1, 67), (1, 1, 72)], [(0, 2, 48)]]))
        self.client.post(url, {'midi': midi()})
        self.assertFalse(Song.objects.get(slug='la-maritza').arrangements.exists())
        self.user.is_superuser = True
        self.user.save()
        self.assertContains(self.client.get(reverse('escalas:song', args=['la-maritza'])), 'type="file"')
        res = self.client.post(url, {'midi': midi()}, follow=True)
        self.assertContains(res, 'Partitura cargada')
        self.assertEqual(set(Song.objects.get(slug='la-maritza').arrangements.values_list('level', flat=True)), {1, 2, 3})
        res = self.client.post(url, {'midi': SimpleUploadedFile('x.mid', b'no es midi')}, follow=True)
        self.assertContains(res, 'data-kind="error"')
        # una versión fácil hecha a mano reemplaza solo su nivel y no se marca como generada
        lv1 = SimpleUploadedFile('b.mid', build_midi([[(0, 1, 62), (1, 1, 64)], [(0, 2, 48)]], key=0))
        self.client.post(url, {'midi': lv1, 'level': 1})
        song = Song.objects.get(slug='la-maritza')
        basic = song.arrangements.get(level=1)
        self.assertEqual(basic.notes['rh'], [[0, 1, 62], [1, 1, 64]])
        self.assertEqual(basic.description, 'Versión preparada a mano.')
        self.assertEqual(song.arrangements.get(level=3).notes['rh'][0][2], 67)   # la avanzada no cambia
        # con la partitura ya cargada, el administrador puede reemplazarla; un usuario normal no
        res = self.client.get(reverse('escalas:song', args=['la-maritza']))
        self.assertContains(res, 'Reemplazar la partitura')
        self.user.is_superuser = False
        self.user.save()
        self.assertNotContains(self.client.get(reverse('escalas:song', args=['la-maritza'])), 'Reemplazar la partitura')


class NavTests(LoggedInTestCase):
    def test_menu_marks_current_section(self):
        cases = [
            (reverse('escalas:home'), 'Inicio'),
            (reverse('escalas:path', args=['banda']), 'Banda'),
            (reverse('escalas:module', args=['solista', 'dos-claves']), 'Solista'),
            (reverse('escalas:song', args=['passacaglia']), 'Canciones'),
            (reverse('escalas:index'), 'Práctica libre'),
            (reverse('escalas:progress'), 'Progreso'),
        ]
        for url, label in cases:
            res = self.client.get(url)
            self.assertContains(res, 'class="mainnav"', msg_prefix=url)
            self.assertRegex(res.content.decode(), rf'aria-current="page">{label}</a>', url)
            self.assertEqual(res.content.decode().count('aria-current="page"'), 1, url)


class HymnAndCategoryTests(LoggedInTestCase):
    HYMNS = ['sublime-gracia', 'noche-de-paz', 'himno-de-la-alegria', 'doxologia']

    def test_hymns_have_three_valid_levels_and_basic_in_c(self):
        for slug in self.HYMNS:
            song = Song.objects.get(slug=slug)
            self.assertEqual(song.category, 'cristiana')
            arrs = {a.level: a for a in song.arrangements.all()}
            self.assertEqual(sorted(arrs), [1, 2, 3], slug)
            for a in arrs.values():
                a.full_clean()
            self.assertEqual(arrs[1].key_fifths, 0, slug)
            # mismo largo en los tres niveles
            ends = {max(t + d for t, d, _ in a.notes['rh']) for a in arrs.values()}
            self.assertEqual(len(ends), 1, slug)

    def test_advanced_keeps_the_melody_on_top(self):
        from importlib import import_module
        from .arranger import lead_sheet, top_line
        data = import_module('escalas.migrations.0011_seed_hymns')
        for slug, _, _, _, h in data.HYMNS:
            melody, _ = lead_sheet(h['melody'], h['chords'], h['start'])
            advanced = SongArrangement.objects.get(song__slug=slug, level=3)
            self.assertEqual(top_line(advanced.notes['rh']), melody, slug)

    def test_amazing_grace_starts_with_pickup(self):
        rh = SongArrangement.objects.get(song__slug='sublime-gracia', level=2).notes['rh']
        self.assertEqual(rh[:4], [[2, 1, 62], [3, 2, 67], [5, 0.5, 71], [5.5, 0.5, 67]])  # Re | Sol – Si Sol

    def test_category_filter(self):
        res = self.client.get(reverse('escalas:songs'))
        for title in ('Passacaglia', 'La Maritza', 'Noche de paz'):
            self.assertContains(res, title)
        self.assertContains(res, 'Cristiana <span>4</span>')
        res = self.client.get(reverse('escalas:songs') + '?categoria=cristiana')
        self.assertContains(res, 'Sublime gracia')
        self.assertNotContains(res, 'Passacaglia')
        self.assertContains(res, 'href="?categoria=cristiana" aria-current="true"')
        res = self.client.get(reverse('escalas:songs') + '?categoria=inexistente')
        self.assertContains(res, 'Passacaglia')  # categoría desconocida = todas


class PerUserProgressTests(LoggedInTestCase):
    def test_attempts_and_records_belong_to_each_user(self):
        from django.contrib.auth import get_user_model
        base = {'mode': 'song', 'config_key': 'song:passacaglia:1:rh', 'title': 'Passacaglia · Básico',
                'errors': 0, 'duration': 30}
        res = self.client.post(reverse('escalas:create_attempt'), json.dumps({**base, 'accuracy': 95, 'score': 400}),
                               content_type='application/json')
        self.assertEqual(Attempt.objects.get(pk=res.json()['id']).user, self.user)
        other = get_user_model().objects.create_user('beto', password='otra-clave-456')
        self.client.force_login(other)
        res = self.client.post(reverse('escalas:create_attempt'), json.dumps({**base, 'accuracy': 40, 'score': 50}),
                               content_type='application/json')
        self.assertEqual(res.json()['record'], {'best': 40, 'runs': 1, 'bpm': 0, 'score': 50})
        res = self.client.get(reverse('escalas:progress'))
        self.assertContains(res, '40%')
        self.assertNotContains(res, '95%')
        res = self.client.get(reverse('escalas:song', args=['passacaglia']))
        self.assertContains(res, '"best": 40')


class FirstStepsTests(LoggedInTestCase):
    def test_path_comes_first_and_pages_render(self):
        from .models import LearningPath
        self.assertEqual(LearningPath.objects.filter(active=True).first().slug, 'primeros-pasos')
        res = self.client.get(reverse('escalas:home'))
        self.assertEqual([p.slug for p in res.context['paths']], ['primeros-pasos', 'solista', 'banda'])
        self.assertContains(res, 'Primeros pasos')
        self.assertContains(res, 'Empieza aquí')
        res = self.client.get(reverse('escalas:path', args=['primeros-pasos']))
        self.assertContains(res, 'Cuando termines, elige tu camino')
        for m in Module.objects.filter(path__slug='primeros-pasos'):
            m.full_clean()
            page = self.client.get(reverse('escalas:module', args=['primeros-pasos', m.slug]))
            self.assertEqual(page.status_code, 200, m.slug)
        page = self.client.get(reverse('escalas:module', args=['primeros-pasos', 'las-siete-notas']))
        self.assertContains(page, 'id="keyName"')
        self.assertContains(page, 'keyfinding.js')

    def test_key_finding_config_is_validated(self):
        from .models import LearningPath
        path = LearningPath.objects.get(slug='primeros-pasos')
        def check(cfg):
            Module(path=path, slug='x', title='x', kind='key_finding', config=cfg).full_clean(exclude=['slug'])
        check({'notes': [60, 62], 'count': 5})
        for bad in ({}, {'notes': []}, {'notes': [60]}, {'notes': [60, 62], 'hints': 'mucho'},
                    {'notes': [60, 62], 'fingers': [1]}, {'notes': [60, 62], 'count': 0}):
            with self.assertRaises(ValidationError, msg=str(bad)):
                check(bad)


class FingeringTests(LoggedInTestCase):
    def test_scale_fingerings_follow_the_textbook(self):
        from .fingering import fingers_for_hand
        up = [[i, 1, m] for i, m in enumerate([60, 62, 64, 65, 67, 69, 71, 72])]
        self.assertEqual(fingers_for_hand(up, 'rh'), [1, 2, 3, 1, 2, 3, 4, 5])
        down = [[i, 1, m] for i, m in enumerate([72, 71, 69, 67, 65, 64, 62, 60])]
        self.assertEqual(fingers_for_hand(down, 'rh'), [5, 4, 3, 2, 1, 3, 2, 1])
        self.assertEqual(fingers_for_hand([[i, 1, m] for i, m in enumerate([60, 59, 57, 55, 53, 52, 50, 48])], 'lh'),
                         [1, 2, 3, 1, 2, 3, 4, 5])
        # acordes con digitación fija: 1-3-5 y el orden de dedos sigue al de las notas
        self.assertEqual(fingers_for_hand([[0, 1, 60], [0, 1, 64], [0, 1, 67]], 'rh'), [1, 3, 5])
        self.assertEqual(fingers_for_hand([[0, 1, 48], [0, 1, 52], [0, 1, 55]], 'lh'), [5, 3, 1])
        self.assertEqual(fingers_for_hand([], 'rh'), [])

    def test_every_version_has_one_finger_per_note(self):
        for a in SongArrangement.objects.all():
            for hand in ('rh', 'lh'):
                fs = a.fingering[hand]
                self.assertEqual(len(fs), len(a.notes[hand]), a)
                self.assertTrue(all(f in (1, 2, 3, 4, 5) for f in fs), a)
        page = self.client.get(reverse('escalas:song', args=['passacaglia']))
        self.assertContains(page, '"fingering"')
        self.assertContains(page, 'id="fingerChk"')

    def test_written_fingerings_in_musicxml_win(self):
        from .musicxml_import import parse_musicxml
        def note(step, fing=''):
            tech = f'<notations><technical><fingering>{fing}</fingering></technical></notations>' if fing else ''
            return (f'<note><pitch><step>{step}</step><octave>4</octave></pitch><duration>2</duration>'
                    f'{tech}<staff>1</staff></note>')
        xml = ('<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>'
               '<part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats>'
               '<beat-type>4</beat-type></time></attributes>' + note('C', 4) + note('D') + note('E', 2) + note('F')
               + '</measure></part></score-partwise>').encode()
        r = parse_musicxml(xml)
        self.assertEqual(r['fingering']['rh'], [4, None, 2, None])
