# Space Boxes V2 — local-first Pages release

This release uses the existing React/Higgsfield scene, three animated task boxes,
planner, IndexedDB workspace, focus lifecycle and evidence-based reports. No
Django server, Supabase project, SMTP service, credentials or account is needed.
Backend/account source remains available for the future connected release.

## Run and verify

Use Node 22.14 or newer (Vite requires a supported Node version):

```sh
cd v2/react-frontend
npm ci
npm run dev -- --mode pages
# http://127.0.0.1:5173/space-boxes-timer/

npm run test:local
npm run test:api
npm run build:pages
npx playwright install --with-deps chromium
npm run test:pages
```

The browser suite serves **dist** on a plain static server at
`/space-boxes-timer/`, without API endpoints or an SPA fallback. It exercises
desktop and mobile navigation, home links/reloads, creation/editing/completion,
extra tasks, session plans, working links, focus, pause/resume, recovery and
single-controller behavior across tabs, history, reports, backup validation and
restoration, offline operations after initial loading, and actual browser process
restart with a persistent profile. Console errors and API calls fail the tests.
Screenshots and a browser report are written under ignored test output folders.
`SPACE_BOXES_BROWSER=/usr/bin/google-chrome npm run test:pages` uses installed Chrome.

`npm run build` retains the connected build at `/`; `npm run build:pages` selects
the explicit local-only release at `/space-boxes-timer/`. Navigation uses dialogs
within this single document; no backend routes or server rewrite rules are needed.
The existing Outfit and IBM Plex Mono fonts are bundled locally with their OFL
licenses, so the visual design needs no font service at runtime.

## Persistence and backup contract

The database remains `space-boxes-v2`, version **2**, with its existing stores,
scope identity, domain validation and serialized focus authority. There is no new
database, migration or replacement task storage. Existing local data at the same
origin remains accessible. The existing localStorage appearance/session-default
preferences remain preferences only; plans and focus evidence stay in IndexedDB.

Data persists through reloads and browser restarts in the same browser profile
and origin. It does **not** automatically sync across devices. Private browsing,
clearing site storage or deleting the profile can erase it. The app states this
on the main page and in Settings. No cloud backup is implied. The site needs to
load initially; this release does not add an offline asset cache/service worker.

Settings → **Export JSON backup** saves a versioned productivity snapshot:

```json
{
  "format": "space-boxes-local-workspace",
  "version": 1,
  "exportedAt": "2026-10-18T12:00:00.000Z",
  "planning": {"ownershipScopeId": "…", "revision": 1, "tasks": []},
  "focus": {
    "ownershipScopeId": "…", "revision": 0, "reservation": null,
    "sessions": [], "evidence": [], "reconciliations": [], "authorityChanges": []
  }
}
```

Export reads planning and focus in one IndexedDB transaction. The file includes
task relationships, notes, resources, retained planning identities, frozen session
snapshots, evidence, decisions and unfinished reservations. It contains personal
content: keep it somewhere safe. Appearance preferences are not part of the file.
V1 localStorage exports and connected-account exports are separate formats.

**Import JSON backup** accepts files up to 10 MiB, validates the format/version,
planning fields, identities, hierarchy, Primary limit, dates/times/timezones,
session/evidence relationships, focus authority and recorded outcomes, then shows
counts before the user chooses **Restore validated backup**. Storage validates
again before writing. Restoration is atomic and requires an empty local
workspace; it never replaces conflicting existing work. An identical already
restored backup is a no-op. To restore while keeping an existing workspace, use
a separate browser profile. Exporting current data does not itself empty it.

Imported records use the receiving browser's existing local scope; task/session
identities, originating provenance and evidence remain intact. An unfinished
import or a reload/restart requires explicit **Recover control here**. Unobserved
time remains uncertain (or an unknown pause) until the user reconciles it; it is
never silently counted as confirmed focus. A task marked complete early remains
distinct from a focus session reaching its planned target.

## Publication gate — public v1 stays in place

The `V2 local-first Pages` workflow builds/tests PRs and this feature branch and
uploads a candidate artifact. **Pushes and PRs never deploy.** Its deployment job
requires all verification to pass plus a manual `workflow_dispatch` with
`deploy=true` and `approved_sha` exactly equal to the selected workflow revision.
The `github-pages` environment can additionally require a human reviewer.

The current public site publishes from `master` using legacy branch-based Pages.
This PR does not change that setting, touch v1 files, merge a production release,
dispatch deployment, or create a `gh-pages` branch. After explicit owner approval
of a tested SHA, the owner must make the workflow available on the default branch,
choose **GitHub Actions** as the Pages source, and permit that approved revision
in the `github-pages` environment's deployment rules. Dispatch the workflow for
that revision, with the approval inputs above. This replaces the public v1 site;
that change is a separate human-controlled operation.

The workflow follows the official [Vite Pages base-path guidance](https://vite.dev/guide/static-deploy.html#github-pages)
and [GitHub Pages custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Local verification — 2026-10-18

Baseline: `feature/v2-complete-release` at
`bd75e17b5d6a9d4ba50887ea830898764fc5f520`. Executed with Node 22.14 and
installed Google Chrome on Linux, using isolated origins/profiles:

- Connected production build and Pages production build: passed (TypeScript and Vite).
- Backup format/domain tests: 20 passed; existing API transport tests: 5 passed.
- Pages browser suite: 15 passed, 1 intentionally skipped duplicate mobile process
  restart. Real process restart runs on desktop; mobile uses Chromium emulation.
- After the final restore refresh-error message change, the affected backup and
  visual browser checks passed again (4 checks).
- Existing planning/classification/session-plan/history/hierarchy/resource suites:
  82 passed across six GJS suites.
- Existing native IndexedDB/focus/restart suites: all 48 expected checks passed.
  Existing report browser suite: 5 passed.
- Desktop/mobile screenshots inspected; original character and three-box scene
  retained, navigation accessible and no page-width overflow observed. The Pages
  browser suite rejects app console errors and any attempted API request.

Vite reports the existing harmless Radix `use client` bundling notices. There
were no runtime console errors in the exercised app flows. Physical mobile
devices/Safari and a public deployment have not been tested. Publication and
Pages source/environment configuration remain owner-controlled; no deployment
was requested or executed during verification.
