# V2 minimal runnable foundation

This foundation provides an isolated Vanilla JavaScript entry point and a local
Django project. It has no product features, accounts, database, migrations, or
browser persistence. Existing V1 files and storage keys are unchanged.

## Setup

Use Python 3.14 with `venv` and pip available. Run all commands from the repository
root:

```bash
python3 -m venv v2/.venv
v2/.venv/bin/python -m pip install -r v2/requirements.txt
```

The sole direct dependency is pinned to Django 5.2.18 (5.2 LTS); pip resolves its
required transitive dependencies. Installation requires package-registry access.
There is no Node/npm dependency or frontend build step.

## Run through Django

```bash
v2/.venv/bin/python v2/backend/manage.py runserver 127.0.0.1:8000
```

Open <http://127.0.0.1:8000/>. Django serves the HTML and JavaScript on the same
origin. No database setup or `migrate` command is needed.
If port 8000 is occupied, use `127.0.0.1:8001` in the command and open
<http://127.0.0.1:8001/> instead.

## Run the frontend independently

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory v2/frontend
```

Open <http://127.0.0.1:8766/>. This mode needs neither Django nor the virtual
environment. In both modes, the initial “Starting V2 frontend…” message changes
to “V2 frontend ready.” when the ES module loads. Stop either server with Ctrl+C.

## Verify

```bash
v2/.venv/bin/python -m pip check
v2/.venv/bin/python v2/backend/manage.py check
v2/.venv/bin/python v2/backend/manage.py test config
git diff --check
git diff --exit-code HEAD -- . ':(exclude)v2/**'
git status --short
```

The built-in Django runner uses `SimpleTestCase` without database setup. The
tests check the frontend document and module reference, JavaScript delivery,
404 responses for unknown routes, and disabled asset serving outside development
mode. They do not execute JavaScript.

For each startup mode, open its URL in a modern browser and confirm the ready
message, successful JavaScript loading in the Network panel, and no console
errors. Verify V1 still loads using its existing command:

```bash
python3 -m http.server 8765
```

Open <http://localhost:8765/>. Inspect all new files and confirm the task changes
are confined to `v2/`.

## Limits

Settings, the public development-only secret, and Django static serving are for
local development only. The frontend does not import V1 modules or access browser
storage. Authentication, PostgreSQL, IndexedDB, domain behavior, synchronization,
visual design, CI, Docker, and production configuration remain future work.
