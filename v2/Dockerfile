# Build the editable React source; the runtime contains no Node or dev server.
FROM node:22.14.0-bookworm-slim@sha256:745403dc46b5ab4c998502b07a12cbf020cf2c30645427a68ec0718f02d647de AS frontend
WORKDIR /build/react-frontend
COPY react-frontend/package.json react-frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY react-frontend/src ./src
COPY react-frontend/index.html react-frontend/tsconfig.json react-frontend/vite.config.ts ./
COPY frontend/js /build/frontend/js
RUN npm run build

# Release lock supports only CPython 3.14 / Linux x86_64.
FROM python:3.14.4-slim-bookworm@sha256:db5942d111df72110e7a67da3fc5159e83ac85cd24808b91bdc4769e166ed1b7
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements-release.txt v2/requirements-release.txt
RUN python -m venv v2/.venv && v2/.venv/bin/pip install --no-cache-dir -r v2/requirements-release.txt && v2/.venv/bin/pip check
RUN groupadd --gid 10001 spaceboxes && useradd --uid 10001 --gid 10001 --no-create-home spaceboxes
COPY --chown=10001:10001 backend v2/backend
COPY --chown=10001:10001 frontend/index.html v2/frontend/index.html
COPY --chown=10001:10001 frontend/js v2/frontend/js
COPY --chown=10001:10001 frontend/css v2/frontend/css
COPY --from=frontend --chown=10001:10001 /build/react-frontend/dist v2/frontend/react
COPY --chown=10001:10001 scripts/start-staging.sh scripts/container-health.py v2/scripts/
RUN mkdir v2/staticfiles && chown 10001:10001 v2/staticfiles
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD ["v2/.venv/bin/python", "v2/scripts/container-health.py"]
CMD ["sh", "v2/scripts/start-staging.sh"]
