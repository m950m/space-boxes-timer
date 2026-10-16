#!/bin/sh
set -eu
# PostgreSQL requires a private key owned by its service account.
install -o postgres -g postgres -m 600 /run/secrets/db_key /var/lib/postgresql/server.key
exec /usr/local/bin/docker-entrypoint.sh postgres \
  -c ssl=on -c ssl_cert_file=/run/secrets/db_cert \
  -c ssl_key_file=/var/lib/postgresql/server.key -c hba_file=/opt/pg_hba.conf
