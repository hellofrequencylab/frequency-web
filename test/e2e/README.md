# E2E: smoke · accessibility · visual

Safety net for the design-system remodel: catches broken pages, accessibility
regressions, and unintended visual drift. No server is spawned — everything
targets `PW_BASE_URL` (a Vercel preview or a locally running `pnpm dev`).

Without `PW_BASE_URL` every spec self-skips, so `--list` and CI collection
always pass.

## The three suites

| Tag | Spec | What it proves | In `pnpm test:e2e`? |
|---|---|---|---|
| `@smoke` | `smoke.spec.ts` | Routes answer 2xx, no console errors, `llms.txt`/`robots.txt` serve | ✅ |
| `@a11y` | `a11y.spec.ts` | axe-core WCAG 2.x A/AA: **0 serious+ violations** | ✅ |
| `@visual` | `visual.spec.ts` | Pixel baselines across four render states × two viewports | ⚠️ opt-in |

`@visual` is the only opt-in suite, because it is the only one with a committed
baseline dependency: a missing PNG fails with "snapshot doesn't exist", which is
noise rather than signal. `@a11y` needs nothing the smoke suite does not already
need, so it rides the default run.

## Run

```sh
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e          # smoke + a11y
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e:visual   # visual only (@visual)
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e:update   # (re)capture baselines

# One suite on its own:
PW_BASE_URL=… pnpm exec playwright test --grep @a11y
PW_BASE_URL=… pnpm exec playwright test --grep @smoke
```

Against a Vercel **preview**, also set `VERCEL_AUTOMATION_BYPASS_SECRET`
(Vercel → project → Deployment Protection → *Protection Bypass for Automation*).
Without it every SSR route serves Vercel's auth interstitial and the suites test
the wall, not the app — `assertNotProtectionWall` in `surfaces.ts` fails loudly
when that happens rather than letting it pass quietly.

## The matrix

`test/e2e/surfaces.ts` is the single registry both suites read.

**Surfaces.** Every `EDITABLE_PAGES` route, *parsed from `lib/page-editor/data.ts`
at run time* (not hardcoded), plus `/discover`. A route converted to a template
under Lift 5c therefore joins the suite automatically and shows up as a missing
baseline — never as silent non-coverage. Member-shell surfaces (`/feed`, a room,
`/settings`, and the Space console) are included when `PW_STORAGE_STATE` points at
a saved storage state for a beta member account.

**Render states.** Four, from the two orthogonal axes in `app/globals.css`:

| id | `<html>` class | `data-skin` |
|---|---|---|
| `dawn-light` | — | `default` |
| `dawn-dark` | `.dark` | `default` |
| `midnight-light` | — | `midnight` |
| `midnight-dark` | `.dark` | `midnight` |

States are stamped by seeding `localStorage['freq-theme']` and
`localStorage['freq-skin']` in an `addInitScript`, so the app's own pre-paint
bootstrap (the inline script in `app/layout.tsx`) computes the state we asked for
on the first frame. Stamping the class directly would be overwritten by that
script a few milliseconds later; seeding its inputs works *with* it.

The member shell captures the two **mode** states only: the authed shell renders
`[data-skin]` server-side on the shell root, a descendant of `<html>`, so it wins
over anything the harness stamps. The other two states would be duplicate PNGs.

**Viewports.** The `desktop` (1280×800) and `mobile` (390×844) projects in
`playwright.config.ts`.

The a11y suite runs the *full* WCAG rule set in `dawn-light` on both viewports,
and a `color-contrast`-only pass in the other three states on desktop. Almost
every axe rule is state-insensitive; contrast is the family that is not, and
colour tokens do not vary by viewport.

## Masking

Dynamic regions are masked so the suite is quiet by default (live counts,
timestamps, live regions, the dispatch ticker, media, avatars). The list, with a
reason per selector, is `GLOBAL_MASK_SELECTORS` in `surfaces.ts`.

Flaky-surface policy: a surface that flakes twice gets a mask or a wait fix the
same week — never a deletion. `PW_VISUAL_EXTRA_MASK=".foo,.bar"` quiets one
immediately without waiting on a code change.

The selectors are structural because the app has no `data-visual-mask`
convention yet. Adding that attribute to the live blocks would collapse the list
to a single selector; until then, moving that markup means updating the mask in
the same change.

## Baselines

Captured **on a runner**, never in an agent sandbox (which cannot reach a deploy
URL): `.github/workflows/e2e.yml` → *Run workflow* → set `base_url` and tick
`update_baselines`. The job commits the PNGs to the branch itself, because
artifact downloads redirect to a host agent sandboxes cannot reach.

Baselines live in `test/e2e/__screenshots__/visual.spec.ts/` and are named
`<surface>--<state>-<project>.png`, so all four looks are separately reviewable.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `PW_BASE_URL` | yes (else everything skips) | Target deployment |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | for previews | Bypass Deployment Protection |
| `PW_STORAGE_STATE` | for the member shell | Path to a saved storage-state JSON |
| `PW_ROOM_PATH` | no (default `/channels`) | The room surface to capture |
| `PW_SPACE_SLUG` | no | Adds `/spaces/<slug>/manage` to the matrix |
| `PW_VISUAL_EXTRA_MASK` | no | Extra mask selectors, comma-separated |

Sign-in is magic-link only, so there is no scriptable login: `PW_STORAGE_STATE`
is produced out of band (sign in once, `context.storageState({ path })`).

## CI

`.github/workflows/e2e.yml` has two entry points:

- **`workflow_dispatch`** — the maintainer path: any URL, optional visual
  compare, optional baseline capture.
- **`pull_request`** — the automatic gate, on PRs touching `app/globals.css`,
  `components/**`, `lib/page-editor/**`, or the harness itself. It resolves the
  PR's own Vercel preview through the deployments API, then runs smoke + a11y +
  visual. It **skips green with a notice** when
  `VERCEL_AUTOMATION_BYPASS_SECRET` is absent or no successful preview exists,
  rather than producing a red X that says nothing about the PR.
