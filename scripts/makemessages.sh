#!/usr/bin/env bash
# Actualiza los catálogos de traducción (locale/<idioma>/LC_MESSAGES/*.po) con los textos nuevos del código.
#   ./scripts/makemessages.sh            # extrae y fusiona
#   ./scripts/makemessages.sh compile    # además genera los .mo que usa la app
# Los textos originales están en español; las traducciones se escriben en los .po (msgstr).
set -euo pipefail
cd "$(dirname "$0")/.."
LANGS="${LANGS:-en pt fr it}"
PY=".venv/bin/python"; [ -x "$PY" ] || PY=python
export PATH="$(dirname "$(realpath "$PY")"):$PATH"

# Python y plantillas: dominio «django»
for l in $LANGS; do $PY manage.py makemessages -l "$l" -i .venv -i staticfiles --no-obsolete --add-location=file --no-wrap -v 0; done

# JavaScript: dominio «djangojs». Las funciones gt(), tf() y tn() (static/escalas/js/i18n.js) son las palabras clave.
POT="$(mktemp --suffix=.pot)"
xgettext --language=JavaScript --from-code=UTF-8 --keyword=gt --keyword=tf --keyword=tn:1,2 \
  --add-location=file --no-wrap --package-name=piano -o "$POT" escalas/static/escalas/js/*.js
for l in $LANGS; do
  PO="locale/$l/LC_MESSAGES/djangojs.po"; mkdir -p "$(dirname "$PO")"
  if [ -f "$PO" ]; then msgmerge --quiet --update --no-wrap --no-fuzzy-matching "$PO" "$POT"
  else msginit --no-translator --no-wrap -l "$l" -i "$POT" -o "$PO" 2>/dev/null; fi
done
rm -f "$POT"

if [ "${1:-}" = compile ]; then $PY manage.py compilemessages -i .venv -v 0; fi
