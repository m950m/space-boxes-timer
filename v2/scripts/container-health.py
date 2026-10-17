"""Readiness: trusted HTTPS document plus an actual PostgreSQL TLS query."""
import os
import ssl
import urllib.request

import psycopg

host = os.environ.get("SPACE_BOXES_HEALTH_HOST", "localhost")
context = ssl.create_default_context(cafile=os.environ["SPACE_BOXES_TLS_CERT"])
with urllib.request.urlopen(f"https://{host}:8000/", context=context, timeout=5) as response:
    if response.status != 200:
        raise SystemExit("Document is unavailable")
with psycopg.connect(
    host=os.environ["SPACE_BOXES_DB_HOST"], port=os.environ["SPACE_BOXES_DB_PORT"],
    dbname=os.environ["SPACE_BOXES_DB_NAME"], user=os.environ["SPACE_BOXES_DB_USER"],
    password=os.environ["SPACE_BOXES_DB_PASSWORD"],
    sslmode=os.environ["SPACE_BOXES_DB_SSLMODE"], connect_timeout=5,
) as connection:
    assert connection.execute("SELECT 1").fetchone() == (1,)
