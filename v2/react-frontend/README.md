# Space Boxes — React frontend

Original faceless-character, animated-box frontend built from the Higgsfield project and integrated with the existing Django V2 API.

**Source of truth:** this folder is the editable frontend; `v2/backend` is the authoritative backend. Do not edit opaque generated `v2/frontend/js/space-boxes-new.js.gz` as source.

## Local development

```sh
cd v2/react-frontend
bun install
bun run typecheck
bun run build
bun run dev
```

For development, Vite forwards `/api/v2` to `http://127.0.0.1:8000`. Change via `SPACE_BOXES_DEV_BACKEND`. On production, host the frontend behind a same-origin reverse proxy to Django; GitHub Pages alone cannot serve Django sessions, CSRF, or Postgres.

## Notes

- Visually preserves Higgsfield's illustrated character, cubes and focus state.
- Account, planner, evidence and focus features need real integration tests with Django.
- Email verification backend is under review in PR #68. Do **not** deploy its frontend path without migrating the backend first.
- The optional `tests/space-boxes-ui.cjs` smoke test uses a fake API; a passing test does not prove production credentials/SMTP work.
- No secrets or production DB data belong in this repository.

To review the full original Higgsfield scaffold (including unused studio/template components), the source archive remains at https://space-boxes-prototype.higgsfield.app/source-packages/space-boxes-frontend-higgsfield-source.zip. The standalone app uses the app-owned components imported here and does not need the Higgsfield tooling layer.
