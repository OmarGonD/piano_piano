# Piano piano · práctica de escalas

App Django para practicar escalas y círculos armónicos. La tablet escucha el piano por el
micrófono y marca si la nota o el acorde es el correcto.

## Arrancar

```bash
source .venv/bin/activate
python manage.py migrate          # crea la BD y carga escalas y círculos iniciales
python manage.py createsuperuser  # tu cuenta de administrador (solo la primera vez)
python manage.py runhttps         # https://<IP-del-PC>:8443/ para la tablet
```

Chrome solo permite el micrófono en páginas **https** (o `localhost`). `runhttps` genera un
certificado autofirmado en `.certs/`; en la tablet aparecerá un aviso: «Configuración avanzada»
→ «Continuar». El PC y la tablet deben estar en la misma red Wi‑Fi.

Para desarrollar en el PC basta con `python manage.py runserver` y abrir `http://localhost:8000/`.

## Cuentas de usuario

Toda la app requiere iniciar sesión, y cada usuario tiene su propio avance: récords, estrellas,
desbloqueos y la página de Progreso.

1. La persona se registra en `/cuenta/registro/`. La cuenta queda **inactiva**.
2. La pantalla siguiente le muestra tu correo y un botón que abre su correo con el mensaje escrito.
   **Tu correo se cambia en un solo lugar**: `cuentas/templates/cuentas/register.html`
   (`{% with admin_email="..." %}`).
3. Tú entras en `/admin/` → Usuarios. Las cuentas pendientes salen primero. Las seleccionas y usas
   la acción **«Activar cuentas seleccionadas»**.
4. Si intenta entrar antes de que la actives, ve «Tu cuenta aún no está activada».

La app no envía correos; si alguien olvida su contraseña, se la cambias desde el admin.

## Publicar en PythonAnywhere

Django 6.1 necesita **Python 3.12 o superior**: elige esa versión al crear la web app y el virtualenv.

1. **Código**: súbelo a `/home/TU_USUARIO/piano_piano` (con git, o subiendo un zip desde la pestaña *Files*).
2. **Virtualenv** (consola Bash de PythonAnywhere):
   ```bash
   mkvirtualenv piano --python=python3.12
   pip install -r ~/piano_piano/requirements.txt
   ```
3. **Web app**: pestaña *Web* → *Add a new web app* → *Manual configuration* → Python 3.12.
   - *Virtualenv*: `/home/TU_USUARIO/.virtualenvs/piano`
   - *Static files*: URL `/static/` → carpeta `/home/TU_USUARIO/piano_piano/staticfiles`
   - *Force HTTPS*: activado (el micrófono solo funciona con https).
4. **Archivo WSGI** (enlace en la pestaña *Web*); reemplaza su contenido por:
   ```python
   import os, sys
   path = '/home/TU_USUARIO/piano_piano'
   if path not in sys.path:
       sys.path.insert(0, path)
   os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
   os.environ['DJANGO_DEBUG'] = '0'
   os.environ['DJANGO_SECRET_KEY'] = 'pega-aquí-una-clave-larga-y-secreta'
   os.environ['DJANGO_ALLOWED_HOSTS'] = 'TU_USUARIO.pythonanywhere.com'
   os.environ['DJANGO_TIME_ZONE'] = 'America/Lima'   # la tuya
   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
   ```
   Para generar la clave: `python -c "import secrets; print(secrets.token_urlsafe(50))"`.
5. **Base de datos, estáticos y administrador** (consola Bash, con el virtualenv activo):
   ```bash
   cd ~/piano_piano
   export DJANGO_DEBUG=0 DJANGO_SECRET_KEY='la-misma-clave' DJANGO_ALLOWED_HOSTS=TU_USUARIO.pythonanywhere.com
   python manage.py migrate
   python manage.py collectstatic --noinput
   python manage.py createsuperuser
   ```
6. Pulsa **Reload** en la pestaña *Web*.

Cada vez que actualices el código: `git pull` (o vuelve a subir los archivos), luego `migrate` y
`collectstatic`, y al final **Reload**.

## Idiomas

La interfaz está en **español** (original), **inglés, portugués, francés e italiano**. El selector de idioma está en
la barra superior; la elección se guarda en una cookie y, sin ella, se usa el idioma del navegador.

- Los textos originales están en español y hacen de clave: `{% trans "..." %}` en plantillas, `gettext` en Python y
  `gt()` / `tf()` / `tn()` (`static/escalas/js/i18n.js`) en JavaScript.
- Las traducciones viven en `locale/<idioma>/LC_MESSAGES/` (`django.po` para Python y plantillas, `djangojs.po` para JS).
  Los `.mo` compilados también están en el repositorio, así que en PythonAnywhere no hay que compilar nada.
- Los textos del catálogo de la base de datos (caminos, módulos, escalas, canciones incluidas) se traducen al mostrarlos;
  sus originales están listados en `escalas/catalog_strings.py`. Si añades uno en el admin, agrégalo ahí.
  Las canciones que subas tú se muestran en el idioma en que las escribas.
- Tras cambiar textos: `./scripts/makemessages.sh` (actualiza los `.po`), traduce lo nuevo (`msgstr`) y
  `./scripts/makemessages.sh compile`. Para un idioma nuevo: añádelo a `LANGUAGES` en `config/settings.py`,
  a `LANGS` en el script y crea su carpeta con el script.

## Caminos

La portada (`/`) ofrece dos caminos. Cada uno tiene 9 módulos en tres niveles: básico, intermedio y avanzado.

| Nivel | Solista (lectura clásica) | Banda (acordes) |
|---|---|---|
| Básico | Clave de sol: pentagrama · líneas adicionales · Clave de fa: pentagrama | Acordes mayores · menores · I–IV–V |
| Intermedio | Clave de fa: líneas adicionales · Sostenidos y bemoles · Frases por grados | Acordes con ♯/♭ · Séptimas · I–V–vi–IV |
| Avanzado | Las dos claves alternadas · Primera vista en sol · Primera vista en fa | ii–V–I · Disminuidos/aumentados/sus · Blues de 12 compases |

La práctica libre (escalas, círculo armónico y afinador) está en `/practicar/`.

### Tipos de ejercicio (`Module.kind`)

Cada módulo tiene un tipo y una configuración JSON, y se crea o edita desde el admin:

- `note_reading`: una nota a la vez.
  `{"clef": "treble|bass|mixed", "low": 64, "high": 77, "accidentals": false, "count": 15}`
- `melody_reading`: frases que se tocan en orden. Además usa `"length"` (notas por frase)
  y `"max_leap"` (salto máximo, en grados).
- `chord_play`: acordes por cifrado (`C`, `F#m`, `Bb7`, `Cmaj7`, `Bdim`, `Caug`, `Dsus4`).
  Pueden ser al azar, `{"chords": [...], "count": 12}`, o progresiones en orden,
  `{"sequences": [{"name": "...", "chords": [...]}], "laps": 1}`.
  `"hints": "always"` muestra las notas; `"on_error"` las muestra solo tras un error.

Un tipo nuevo necesita tres cosas: una opción en `Module.KINDS` con su validador, una plantilla
`templates/escalas/modules/<tipo>.html` que extienda `_exercise.html`, y un JS que use `session.js`.

## Canciones

En `/canciones/` cada canción tiene tres versiones (básica, intermedia y avanzada). Cada versión
se aprende en tres pasos: **mano derecha → mano izquierda → manos juntas**. Cada paso se
desbloquea con una estrella en el anterior (60 % de notas bien).

- Modo espera: la partitura avanza cuando tocas bien cada nota o grupo de notas.
- Marcador: notas bien sobre el total, puntos (10 por nota × multiplicador de combo, hasta ×4)
  y combo. Al final se muestran estrellas (60 %, 80 % y 95 %), récord de puntos y desbloqueos.
- Con el micrófono, en los momentos con varias notas a la vez (manos juntas, acordes) basta con
  que reconozca una de ellas, porque detecta una nota a la vez. En la pantalla hay que tocarlas todas.

**El nivel básico se valida siempre**: sin armadura (Do mayor o La menor), solo teclas blancas,
nada más corto que una negra, una nota a la vez por mano, la derecha entre Do4 y La5 y la
izquierda entre Mi2 y Do4. Las reglas están en `escalas/arranger.py`.

Canciones incluidas:
- **Passacaglia** (Händel, HWV 432). Sus tres versiones son arreglos propios sobre la armonía de
  la obra; la básica está en La menor.
- **La Maritza** (Jean Renard y Pierre Delanoë, 1968). Tiene derechos de autor vigentes, así que la
  app no trae su partitura: queda a la espera de un MIDI.
- **Himnos cristianos de dominio público**: Sublime gracia (1829), Noche de paz (1818), Himno de la
  alegría (1824) y Doxología (1551). Están escritos como hoja guía (melodía + acordes) en
  `migrations/0011_seed_hymns.py`, y `arranger.arrange()` y `arranger.derive()` generan sus tres niveles.

La lista se filtra por categoría (`/canciones/?categoria=cristiana`): Clásica, Cristiana o Popular.
Al importar una canción nueva, su categoría se indica con `--category`.

### Importar desde MIDI

```bash
# carga la versión completa en Avanzado y genera Intermedio y Básico a partir de ella
python manage.py import_song_midi la-maritza 3 maritza.mid --derive

# con una pista por mano (si no, se separan en el Do central)
python manage.py import_song_midi passacaglia 3 passacaglia.mid --rh-track 1 --lh-track 2

# una canción nueva
python manage.py import_song_midi mi-cancion 3 archivo.mid --derive --create-song "Mi canción" --composer "..."
```

Con `--derive`:
- **Intermedio**: la voz más aguda de la derecha, sin notas más cortas que una corchea, y un bajo
  por medio compás.
- **Básico**: la melodía en negras o más largas, transportada a Do mayor o La menor. Las teclas
  negras que queden pasan a la blanca de abajo, y cada mano se ajusta a su registro.

Las canciones nuevas se crean en el admin (Canciones) o con ese comando. Las notas de una
versión son `{"rh": [[inicio, duración, nota MIDI], ...], "lh": [...]}`, con inicio y duración
en tiempos (negra = 1).

## Agregar escalas o círculos sin tocar código

`python manage.py createsuperuser` y entra en `/admin/`:

- **Tipos de escala**: intervalos en semitonos (`[0,2,4,5,7,9,11]`), intervalos al bajar si
  difieren, y grados de letra si la escala no tiene 7 notas (p. ej. pentatónica mayor `[0,1,2,4,5]`).
- **Círculos armónicos**: lista de acordes `{"d": grado 0–6, "s": 1 séptima, "h": 1 sensible elevada}`.

## Estructura

- `escalas/models.py`: `ScaleType` y `Progression` (catálogo) y `Attempt` (historial de intentos).
- `escalas/views.py`: página de práctica, `/progreso/` y `POST /api/attempts/`.
- `escalas/static/escalas/js/`
  - `theory.js`: teoría musical (escalas, digitación, acordes)
  - `dsp.js`: detección de altura (YIN) y de acordes (cromagrama), sin DOM
  - `mic.js`: micrófono, umbral adaptativo y seguimiento de notas estables
  - `midi.js`: teclado MIDI por USB
  - `practice.js`: lógica de práctica y resultados
  - `ui.js`: render (pentagramas, teclado, indicaciones)
  - `audio.js`: síntesis de ejemplos y metrónomo
  - `main.js`: conecta los controles de la práctica libre
  - `session.js`: base común de las páginas de módulo (micrófono, teclado, resultados)
  - `reading.js`, `melody.js`, `chordplay.js`: un archivo por tipo de ejercicio
  - `notegen.js`: notas y frases al azar
  - `song.js`: juego de canciones; `staff.js` también dibuja partitura con armadura y pentagrama doble
- `escalas/midi_import.py`: lector de MIDI sin dependencias (comando `import_song_midi`)
- `escalas/arranger.py`: reglas del nivel básico y generación de versiones simplificadas
- `templates/escalas/_nav.html`: menú superior, común a todas las páginas
  - `staff.js`: pentagrama con clave; `keyboard.js`: teclado en pantalla
  - `mic.js` no depende de ninguna página: cada una le pasa sus reacciones con `configureMic()`

Tests: `python manage.py test escalas`
