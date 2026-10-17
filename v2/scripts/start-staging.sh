#!/bin/sh
# Run from any directory; environment must already be exported.
set -eu
cd "$(dirname "$0")/../.."
PYTHON="$PWD/v2/.venv/bin/python"
export DJANGO_DEBUG=0

"$PYTHON" v2/backend/manage.py check --deploy --fail-level ERROR
"$PYTHON" v2/backend/manage.py migrate --check --no-input
"$PYTHON" v2/backend/manage.py collectstatic --no-input --clear --ignore='*.md'

# TLS may terminate here for local staging, or at an owner-configured proxy.
set --
if [ -n "${SPACE_BOXES_TLS_CERT:-}" ] || [ -n "${SPACE_BOXES_TLS_KEY:-}" ]; then
    : "${SPACE_BOXES_TLS_CERT:?Both TLS cert and key are required}"
    : "${SPACE_BOXES_TLS_KEY:?Both TLS cert and key are required}"
    set -- --certfile "$SPACE_BOXES_TLS_CERT" --keyfile "$SPACE_BOXES_TLS_KEY"
fi
exec "$PYTHON" -m gunicorn --chdir v2/backend config.wsgi:application \
    --bind "${SPACE_BOXES_BIND:-127.0.0.1:8000}" \
    --workers "${SPACE_BOXES_WORKERS:-2}" --preload \
    --no-control-socket \
    --forwarded-allow-ips='' --error-logfile - --capture-output "$@"
