# Space Boxes — React frontend

Original faceless-character, animated-box frontend built from the Higgsfield project and integrated with the existing Django V2 API.

**Source of truth:** this folder is the editable frontend; `v2/backend` is the authoritative backend. Do not edit opaque generated `v2/frontend/js/space-boxes-new.js.gz` as source.

## Local development

```sh
cd v2/react-frontend
npm ci
npm run typecheck
npm run build
npm run dev
```

For development, Vite forwards `/api/v2` to `http://127.0.0.1:8000`. Change via `SPACE_BOXES_DEV_BACKEND`. On production, host the frontend behind a same-origin reverse proxy to Django; GitHub Pages alone cannot serve Django sessions, CSRF, or Postgres.

## Notes

- Visually preserves Higgsfield's illustrated character, cubes and focus state.
- Use Node 22.14.0 and the committed npm lock. The production Docker image builds this source and serves React and Django from the same origin; `/classic` redirects home.
- From the repository root, `v2/.venv/bin/python v2/scripts/verify-local-product.py` creates/removes its own disposable PostgreSQL cluster and private file mailbox, then runs migrations, Django tests, the build and browser tests. Requires PostgreSQL 18, Chrome/Chromium and installed Python/npm dependencies. Override installation paths with `SPACE_BOXES_QA_PG_BIN` and `SPACE_BOXES_BROWSER`.
- `tests/e2e/real-product.spec.ts` uses actual Django/PostgreSQL. `mocked-failures.spec.ts` and `npm run test:api` use mocked failures. File email does not prove external delivery. Browser traces are disabled to keep passwords/tokens out of test logs.
- See [current release notes and remaining staging gates](../RELEASE-CANDIDATE.md).
- No secrets or production DB data belong in this repository.

To review the full original Higgsfield scaffold (including unused studio/template components), the source archive remains at https://space-boxes-prototype.higgsfield.app/source-packages/space-boxes-frontend-higgsfield-source.zip. The standalone app uses the app-owned components imported here and does not need the Higgsfield tooling layer.
