#!/bin/sh
set -eu
freshclam || echo "WARNING: ClamAV definitions could not be updated during startup" >&2
exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 900 server:app
