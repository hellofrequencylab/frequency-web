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

A fourth tag, **`@shell`**, cuts across the other two: it marks every test that needs a
member session. `test/e2e/shell-reporter.ts` counts those and reports what the run did
with them — see [The member shell](#the-member-shell).

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
`/settings`, and the Space console) join when `PW_STORAGE_STATE` points at a live
member session; without one they skip, and the run says so in words rather than
as a skip count — see [The member shell](#the-member-shell).

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
Member-shell files are the `app-*` ones (`app-feed`, `app-room`, `app-settings`,
`app-space-console`) and are captured only with `capture_shell` ticked.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `PW_BASE_URL` | yes (else everything skips) | Target deployment |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | for previews | Bypass Deployment Protection |
| `PW_STORAGE_STATE` | for the member shell | Path to a saved storage-state JSON |
| `PW_ROOM_PATH` | no (**no default** — unset means no room surface) | The room surface to capture |
| `PW_SPACE_SLUG` | no | Adds `/spaces/<slug>/manage` to the matrix |
| `PW_VISUAL_EXTRA_MASK` | no | Extra mask selectors, comma-separated |
| `PW_MEMBER_EMAIL` | to mint a session | The e2e member account (see below) |
| `SUPABASE_SERVICE_ROLE_KEY` | to mint a session | Admin key, used only to mint |
| `PW_REQUIRE_SHELL` | no | `1` makes an unphotographed shell a **failure** |

## The member shell

Four surfaces live inside the `(main)` shell and need a signed-in member:
`/feed`, `/settings`, the room (`PW_ROOM_PATH`) and the Space console
(`/spaces/<PW_SPACE_SLUG>/manage`). The last two are present **only** when their
env var is set. **They are the only captured surfaces that have a rail, a dock or
a fold control.** Everything else in the matrix is a marketing page rendered
outside the shell.

> 🔴 **The room had a `/channels` fallback and it was silently wrong.** `/channels`
> is in `proxy.ts`'s `PROTECTED_PATHS`, so the visit bounced and #2049 committed
> four `app-room` baselines that were pixel-for-pixel the marketing home page —
> hero copy and JOIN THE BETA button included. They were deleted in the 2026-08-10
> pass. `assertMemberSession` now fails a member surface that lands anywhere but
> its own path, or that renders without the shell's own `[data-tour-anchor="content"]`
> region, and `baseline-distinctness.test.ts` fails the committed tree if two
> surfaces are ever near-identical again. **Do not re-add a fallback here** — point
> `PW_ROOM_PATH` at a room the beta account is actually in, or leave the surface absent.

That is why this section exists at all. On PR #2048 the gate returned
`12 skipped · 64 passed` — green — over a change that removed the rail fill,
moved the fold control and resized both dock heads. The 12 skips were this whole
list.

### What an unphotographed shell looks like now

`test/e2e/shell-reporter.ts` rides along with every run. When the `@shell` tests
are collected and **none of them execute**, the run prints a **PARTIAL** banner
to the terminal and to `$GITHUB_STEP_SUMMARY`, naming each surface that went
unphotographed, why, and the one command that fixes it. It also emits a
`::warning` annotation so the PR's checks page carries it.

It does **not** turn the run red. An owner-held secret that does not exist yet is
not a pull request's fault, and a red X meaning "nobody has created a credential"
is how a check gets ignored. The exit code stays honest; the *words* change.

Once the credential and the shell baselines exist, set the repo variable
`PW_REQUIRE_SHELL=1` and the same situation becomes a hard failure — so a
credential that later expires cannot quietly re-open the blind spot.

### Minting a session

Sign-in is **magic-link only** (`app/sign-in/actions.ts` → `signInWithOtp`), so
there is no password to script. The session is minted instead, exactly the way
the product does it in `app/(main)/impersonate-actions.ts`:
`admin.auth.admin.generateLink({ type: 'magiclink' })` sends no email and returns
a `hashed_token`; `verifyOtp` exchanges it for a real session.

```sh
PW_BASE_URL=https://<preview>.vercel.app \
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
PW_MEMBER_EMAIL=e2e@… \
pnpm e2e:session          # → test/e2e/.auth/member.json (git-ignored, mode 600)

PW_STORAGE_STATE=$PWD/test/e2e/.auth/member.json \
PW_BASE_URL=https://<preview>.vercel.app pnpm test:e2e:visual
```

The script **verifies before it writes**: it replays the minted cookies against
`PW_BASE_URL/feed` and refuses to produce a file that lands on `/sign-in`.

**Why minted per run rather than saved once.** A hand-exported storage state is a
dead end for the PR gate, for two independent reasons:

| | What breaks |
|---|---|
| **Cookie domain** | Supabase auth cookies are host-scoped, and every PR gets a **new** `*.vercel.app` preview hostname. A file exported against production is never sent to the deployment under test. |
| **Refresh rotation** | Refresh tokens rotate on use, so the first run that refreshes invalidates the stored copy. |

Both failures look exactly like "no credential" — the suite lands on `/sign-in` —
which is the silence this harness exists to remove. Minting takes ~2s and is
scoped to the host under test, so neither can happen. If a member surface *does*
land on `/sign-in` with a session configured, `assertMemberSession` in
`surfaces.ts` throws rather than photographing the wall under `/feed`'s name.

A by-hand export (sign in once, `context.storageState({ path })`) still works for
**local** runs against a URL whose hostname matches, and is fine for a quick look.
It is not a CI credential.

### Owner runbook: turning the shell on, in order

The order matters; see ADR-948's amendment and ADR-950.

1. **Create the e2e member account.** Sign in once with a dedicated address (for
   example `e2e@…`) and **finish onboarding**, so `/feed` renders the feed rather
   than the induction flow. Give it membership of one Space it can manage if you
   want the Space console covered. It should look like a normal, slightly boring
   member: its avatar and any live counts are masked, but its content is not.
2. **Add four repo secrets** (Settings → Secrets and variables → Actions):
   `PW_MEMBER_EMAIL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   and `SUPABASE_SERVICE_ROLE_KEY`. Optionally add repo **variables**
   `PW_ROOM_PATH` and `PW_SPACE_SLUG`.

   > 🔴 **Check the secrets page, do not infer from a workflow file.** An earlier
   > revision of this runbook said three of these "usually are" already present
   > because `help-index.yml` references them. Referencing is not existing —
   > checked against the live settings page on 2026-08-05, the repository held
   > only `ANTHROPIC_API_KEY` and `VERCEL_AUTOMATION_BYPASS_SECRET`.
   >
   > That is worth knowing beyond this runbook: **GitHub substitutes an absent
   > secret with the empty string and does not fail.** So `help-index.yml` has
   > been running with an empty Supabase URL and service key — a workflow that
   > looks configured, runs green, and does nothing. Any workflow reading a
   > secret should assert it is non-empty rather than trusting the reference.
3. **Take the first baselines, deliberately.** Dispatch `e2e-manual.yml` with
   `base_url` = a preview, **`capture_shell` ✔**, **`update_baselines` ✔**. This
   writes 12 brand-new PNGs (16 with a Space slug) and commits them. They have
   never existed, so this run captures rather than compares — and until it has
   run, a PR gate that reaches the shell would fail with "snapshot doesn't
   exist". Then **push a real commit** (the runner's `GITHUB_TOKEN` push does not
   re-trigger CI — see this file's *Baselines* section).
4. **Seed the shell's a11y counts.** Dispatch `e2e-manual.yml` with
   `capture_shell ✔` + `update_a11y ✔`. A surface with no entry in
   `a11y-baselines.json` is held to zero serious+ violations, so seeding first
   stops the first PR run failing on debt that predates it.
5. **Set `PW_REQUIRE_SHELL=1`.** From here, a run that photographs zero app
   surfaces fails instead of announcing. Put it in **Variables** — the workflow
   also reads the Secrets tab so a mis-aimed entry still arms the ratchet, but a
   one-character *secret* risks GitHub redacting every `1` in the run log.
6. **Only now** make `pr-compare` a required check (ADR-948).

## CI

Two files, deliberately apart:

- **`.github/workflows/e2e.yml`** — the automatic gate on PRs touching `app/**`,
  `components/**`, `lib/page-editor/**`, or the harness itself. It resolves the
  PR's own Vercel preview through the deployments API, mints a member session,
  then runs smoke + a11y + visual (job `pr-compare`) alongside Lighthouse. It
  **skips green with a notice** when `VERCEL_AUTOMATION_BYPASS_SECRET` is absent
  or no successful preview exists, rather than producing a red X that says
  nothing about the PR — and it announces a **PARTIAL** result when the member
  session is missing.
- **`.github/workflows/e2e-manual.yml`** — the maintainer path, dispatch-only so
  it never appears as a permanently-"skipped" row on a PR: any URL, optional
  visual compare, optional baseline capture, optional a11y capture, optional
  `capture_shell`.
