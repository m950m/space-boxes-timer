#!/bin/sh
set -eu
# Runs once on an empty volume. Values use psql quoting, never shell SQL expansion.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_user SPACE_BOXES_DB_USER
\getenv app_password SPACE_BOXES_DB_PASSWORD
\getenv app_db POSTGRES_DB
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE :"app_db" OWNER TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
SQL
