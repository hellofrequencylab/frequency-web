# Architecture

Engineering overview for `frequency-web`: how the tree is laid out, which module owns what,
and which invariants are enforced by a machine rather than by convention.

**This doc describes the system, never its progress.** Status for open work lives in
[`BUILD-BACKLOG.json`](BUILD-BACKLOG.json) (`pnpm backlog`), the one list (ADR-1043). Companions:
[GLOSSARY.md](GLOSSARY.md) (domain terms), [DATABASE.md](DATABASE.md) (schema),
[DECISIONS.md](DECISIONS.md) (the ADR ledger, which wins over any plan doc).

> **Verified against the tree on 2026-08-17.** Every backticked path, route and cron name below
> is checked by `pnpm check:arch-doc` (`scripts/check-arch-doc.mjs`), which fails when this doc
> names something that does not exist. When the code and this doc disagree, the code wins and
> this doc gets fixed in the same pass.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | Next 16 renamed *Middleware* to *Proxy*. The root `proxy.ts` is correct; do **not** rename it to `middleware.ts`. |
| UI runtime | **React 19**, **TypeScript** strict | `noUnusedLocals` is off, so unused locals/imports are ESLint warnings, not type errors. |
| Data | **Supabase** (Postgres + Auth + Realtime) via `@supabase/ssr` | Four clients — see [Authorization model](#authorization-model-read-this-first). |
| Styling | **Tailwind v4** over the DAWN semantic-token layer (`app/globals.css`) | **No component library** — still no shadcn or Radix in `package.json` (ADR-011). Primitives are hand-written in `components/ui`. |
| Icons | `lucide-react` in client components; `components/ui/icon.tsx` in Server Components | The `<Icon>` primitive renders Iconify sets (lucide + ph + tabler) as inline SVG, zero client JS. See [ICONS.md](ICONS.md) (ADR-505). |
| Rich text | `@tiptap/react` | Editor program: [EDITOR-ARCHITECTURE.md](EDITOR-ARCHITECTURE.md). |
| Money / mail / push | `stripe`, `resend`, `web-push` | |
| Maps / media | `maplibre-gl`, `sharp`, `@resvg/resvg-wasm` | `sharp` reach is budgeted in `postbuild` — see [DEPLOY-SAFETY.md](DEPLOY-SAFETY.md). |
| AI | `@anthropic-ai/sdk` | Voice primer for every generation path: `lib/ai/voice.ts`. |
| Ops | `@sentry/nextjs`, `@upstash/ratelimit` + `@upstash/redis` | |
| Tests | `vitest` (unit) + `@playwright/test` (e2e, a11y, visual) | |
| Hosting | **Vercel**; cron declared in `vercel.json` | Merging to `main` **is a deploy** ([DEPLOY-SAFETY.md](DEPLOY-SAFETY.md), ADR-1003). |

### Domain & canonical URL

Production is served at the apex domain **`frequencylocal.com`** (GoDaddy DNS → Vercel; Supabase
Site URL set to match). Two env vars carry it, and both **fall back to the apex**, so a deploy
that forgets one still advertises the right host:

| Var | Read by | Fallback | Used for |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `lib/site.ts` (`SITE_URL`) | `https://frequencylocal.com` | Canonical tags, sitemap, robots, OpenGraph, JSON-LD |
| `NEXT_PUBLIC_APP_URL` | 33 server call sites directly, as `?? 'https://frequencylocal.com'` (measured 2026-08-17) | `https://frequencylocal.com` | Absolute links inside email, ICS feeds, QR targets, auth `redirectTo` |

⚠️ The apex is *inlined* at those call sites rather than read from one helper, so a domain change
is a tree-wide edit, not a config change. Prefer `SITE_URL` from `lib/site.ts` in new code.

## Directory map

Route groups do not appear in the URL. `(main)` is the authenticated shell; everything else is
public or standalone.

| Path | What lives there |
|---|---|
| `app/(main)` | Authenticated app shell — community sub-menu on top, features/admin rail on the side (ADR-057). Feed, `app/(main)/circles`, `app/(main)/events`, `app/(main)/spaces`, `app/(main)/messages`, `app/(main)/practices`, `app/(main)/journeys`, `app/(main)/settings`, … |
| `app/(main)/admin` | Operator consoles. Gated on the **staff** axis (`web_role`), not the community ladder — see [Authorization model](#authorization-model-read-this-first). Menu rows come from the catalog, never from the rail ([MENU-CONTRACT.md](MENU-CONTRACT.md), ADR-553). |
| `app/(marketing)` | Logged-out marketing + SEO article surfaces. |
| `app/(help)` | Public help center, generated from `content/help`. |
| `app/(capture)` | Short no-chrome capture flows (check-in, exchange, intro, unlock). |
| `app/discover` | Public, logged-out SEO/AEO read-only layer. |
| `app/api` | Route handlers: `app/api/cron`, `app/api/webhooks`, `app/api/unsubscribe` (RFC 8058 one-click POST), search, geocode, QR, vitals, observability. |
| `app/unsubscribe` | No-auth unsubscribe landing page (the GET half of RFC 8058). |
| `lib` | Shared modules, one directory per subsystem (`lib/comms`, `lib/core`, `lib/rewards`, `lib/studio`, `lib/queue`, `lib/observability`, …). |
| `components` | UI primitives (`components/ui`), layout chrome (`components/layout`), page templates (`components/templates`). |
| `scripts` | Contract guards (`check-*.mjs`) plus one-off migration/backfill helpers. |
| `supabase/migrations` | SQL migrations — **the** source of truth for schema. |
| `content/help` | Help-center source. |
| `docs` | This documentation. |

## Machine-enforced contracts

Several subsystems that were once "compose it by hand and review carefully" are now single-source
registries with a guard. **Do not hand-roll against any of these** — edit the source they derive
from.

| Contract | Edit here | Spec | Guard |
|---|---|---|---|
| Page layout | `components/templates` + `lib/layout/page-chrome.ts` | [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) | `pnpm check:templates` |
| Creation wizards / edit rails | `lib/studio/entities`, `lib/studio/registry.ts` | [STUDIO.md](STUDIO.md) (ADR-986) | `pnpm check:studio` |
| Admin menu + rail | `lib/admin/modules/registry.ts`, `lib/admin/modules/space-modules.ts` | [MENU-CONTRACT.md](MENU-CONTRACT.md) (ADR-553) | `pnpm check:menu` |
| Page editor / blocks | `lib/page-editor` | [EDITOR-ARCHITECTURE.md](EDITOR-ARCHITECTURE.md) (ADR-974) | `pnpm check:render-path` — an editable page's coded body may only shrink |
| Embeddable elements | `lib/elements/registry.ts` | [EMBEDDABLE-ELEMENTS.md](EMBEDDABLE-ELEMENTS.md) (ADR-792) | `pnpm check:elements` |
| Authorization | every `'use server'` file | [§ below](#authorization-model-read-this-first) (ADR-246) | `pnpm check:authz` |
| Design tokens | `app/globals.css` | [§ Styling](#styling--design-tokens-dawn) | `pnpm check:tokens`, `pnpm check:phantom` |
| The backlog | `docs/BUILD-BACKLOG.json` | ADR-1043 | `pnpm check:backlog`, `pnpm check:one-list` |
| Build artifact size | the fan-out, not the budget | [DEPLOY-SAFETY.md](DEPLOY-SAFETY.md) (ADR-1003) | `postbuild` only — CI never builds |

## Authorization model: READ THIS FIRST

Four Supabase clients, in `lib/supabase`:

| Client | File | Session | RLS |
|---|---|---|---|
| `createClient()` | `lib/supabase/server.ts` | Request-scoped, signed-in user | ✅ enforced |
| `createAdminClient()` | `lib/supabase/admin.ts` | Service role | 🔴 **bypassed** |
| `createClient()` (browser) | `lib/supabase/client.ts` | Browser session | ✅ enforced |
| `createPublicClient()` | `lib/supabase/public.ts` | Cookieless `anon` | ✅ enforced, and stays statically renderable |

`createAdminClient()` is called at roughly **1,350 sites across ~670 files** in `app/` + `lib/`
(measured 2026-08-17), because most mutations read or write rows the caller cannot see under RLS.
**Because it bypasses RLS, authorization MUST be enforced in application code.** Every server
action that uses the admin client is responsible for its own authz check. Do not assume the
database will stop an unauthorized write. It won't.

> **Enforced in CI (ADR-246).** `scripts/check-authz-guards.mjs` (`pnpm check:authz`, in the `ci`
> workflow's guard array) fails the build if a `'use server'` file uses `createAdminClient()`
> without establishing the caller, checking a capability, or verifying a signed token. A genuinely
> public action opts out with `// authz-ok: <reason>` or the script's allowlist. That converts the
> rule above from convention into a gate.

**RLS convergence (ADR-042)** moves own-row and public reads back onto the session client so RLS
enforces them; cross-user aggregate reads stay on the admin client until they get `SECURITY
DEFINER` RPCs plus policy tests. When you add a read, prefer the session client if RLS already
covers it, and reach for the admin client only for cross-user aggregates, cron/webhooks, or
staff-only surfaces. `pnpm check:admin-client` ratchets the set of admin-client files.

### Caller identity

`lib/auth.ts` is the canonical home:

- `getMyProfileId(): Promise<string | null>` — profile id, or null if anon.
- `requireProfileId(): Promise<string>` — profile id, or `redirect()` to `/sign-in` / `/onboarding`.
- `getCallerProfile()` — use when an action makes a **community-role** decision.
- `getRealCallerRole()` / `getRealCallerWebRole()` — the true roles, ignoring any view-as overlay.
- `isPlatformStaff()` — the staff test.

### Two role axes, not one ladder

`lib/core/roles.ts` is the single source of truth (ADR-208, [NAMING.md](NAMING.md) §Roles):

| Axis | Column | Values | Means |
|---|---|---|---|
| Community trust | `profiles.community_role` | `member < crew < host < guide < mentor` (then the deprecated `admin`, `janitor` rungs) | Who leads Circles / Hubs / Nexuses. "host+" refers to **this** axis only. |
| Staff | `profiles.web_role` | `none` \| `admin` \| `janitor` | Who may enter admin surfaces and the janitor-only crown jewels. Not a ladder you climb. |

⚠️ Two rungs on the community axis are deprecated but **kept in the type and the Postgres enum**
for ordering parity: `crew` (paid standing moved to the `membership_tier` entitlement, migration
`supabase/migrations/20260612060000_retire_crew_role_value.sql`) and `admin`/`janitor` (staff moved
to `web_role`, migration `supabase/migrations/20260613000050_naming_canon_roles_split.sql`). Compare
with `ROLE_HIERARCHY` from `lib/core/roles.ts`; gate staff with the `WebRole` helpers, never with a
community rung.

### Database-side hardening

Two triggers on `profiles` block self-edit from the browser anon client:

- `prevent_role_self_escalation` — blocks `community_role` changes
  (`supabase/migrations/20240205000000_prevent_role_self_escalation.sql`).
- `prevent_economy_self_edit` — blocks `current_season_zaps`, `lifetime_zaps`, `lifetime_gems`,
  `current_season_rank`, `lifetime_rank`, `is_active`, `profile_border`, `profile_flair`,
  `custom_title`, `profile_theme`. Current definition:
  `supabase/migrations/20260702000001_rewards_v3_teardown.sql` (the Rewards Economy v3 rebuild
  dropped the `current_season_gems` and `season_challenges_complete` columns the earlier version
  also guarded).

Both allow the service role through, so legitimate writes via admin server actions work; direct
user `UPDATE`s to these columns are rejected. Execute is revoked from `public`/`anon`/`authenticated`
on every `SECURITY DEFINER` trigger function
(`supabase/migrations/20260926000000_lockdown_secdef_trigger_functions.sql`).

## Server-action error contract

Three conventions coexist deliberately; pick by how the caller consumes the result. The contract
type and helpers live in `lib/action-result.ts`.

1. **`ActionResult<T> = { data: T } | { error: string }`** — for actions invoked imperatively whose
   success/failure the UI must show. Build with `ok(data?)` / `fail(msg)`; discriminate with
   `isError(result)`.
2. **`throw`** — for mutations the client wraps in `try/catch`. Note: in production Next.js
   *redacts* thrown messages to a generic digest; the real text is only in Vercel function logs.
3. **void + `redirect(...)`** — for actions that navigate on completion.

## Cron

**`vercel.json` is the schedule's source of truth**, and every entry maps 1:1 to a route handler
under `app/api/cron`. **27 jobs as of 2026-08-17**, in seven families:

| Family | Example jobs | Cadence |
|---|---|---|
| Delivery + queue | `process-queue`, `weekly-digest`, `nurture`, `conversation-batches` | 2 min → weekly |
| Events | `event-reminders`, `event-occurrences`, `space-follower-event-reminders` | 15 min / nightly |
| Growth + CRM | `space-campaigns`, `space-drips`, `journey-drips`, `referral-release` | 5–30 min |
| Embeddings | `embed-events`, `embed-practices`, `embed-help`, `embed-library`, `embed-room-messages` | nightly / 10–30 min |
| Lifecycle + season | `publish-scheduled`, `season-go-live`, `practice-lifecycle`, `lifecycle-triggers` | 5 min → nightly |
| Money + retention | `billing-renewals`, `enforce-retention`, `demo-decay`, `refresh-traits` | nightly |
| AI (Vera) | `vera-owner-brief`, `journey-prompt`, `summarize-vera-memory` | daily |

Every handler is wrapped twice, and both wrappers are contract-checked:

1. **Authorization** — `rejectUnauthorizedCron(req)` from `lib/cron-auth.ts`, which is
   **fail-closed**: a missing `CRON_SECRET` in production rejects every request. (Vercel Cron sends
   `Authorization: Bearer <CRON_SECRET>`.) Dev allows an unset secret for local runs.
2. **Heartbeat** — `withCronHeartbeat(...)` from `lib/observability/cron-heartbeat.ts` pings a
   dead-man's-switch monitor on success and reports failures to Sentry, then re-throws. It is a safe
   no-op when unconfigured. `scripts/cron-freshness.mjs` (`pnpm check:cron-freshness`) asserts the
   wiring half strictly and reports the deployment half as *not established* rather than guessing;
   it runs weekly in `.github/workflows/maintenance.yml`, deliberately **not** in `ci.yml`
   (ADR-970). Contract: [OBSERVABILITY-BASELINES.md](OBSERVABILITY-BASELINES.md) §4a.

> ⚠️ **The Rewards Economy v2 crons are gone.** `coop-pulse` and `practice-streaks` (ADR-219) were
> deleted with the **Rewards Economy v3** rebuild (ADR-305), which retired Co-op Pulse, Carrier
> Wave, Co-op Synchrony and the Practice Shelf and dropped their tables in
> `supabase/migrations/20260702000001_rewards_v3_teardown.sql`. **No cron replaced them** — v3 pays
> out inline from the classifier on the event that earned it. Spec:
> [REWARDS-ECONOMY.md](REWARDS-ECONOMY.md).

## Notifications, email, push

- **The gate:** every outbound message passes one decision — `resolveSendGate` /
  `evaluateSendGate` in `lib/comms/send-gate.ts` (ADR-169), which folds together notification
  preferences, the consent ledger (`lib/consent/consent.ts`) and the suppression list
  (`lib/suppression.ts`). Use it rather than checking the three by hand.
- **Preferences:** `lib/notification-preferences.ts` holds the per-category bits; the ONE seam every send site asks is `resolveSendGate` in `lib/comms/` (consent + suppression + subject mutes + the bit), never `shouldSend` directly (`lib/comms/send-gate-seam.test.ts` pins that, 2026-09-04).
  Channels: `email` / `inapp` / `push`. Categories: `dispatches`, `events`, `mentions`,
  `lifecycle`, `comments`, `practice` (plus consent-governed `marketing`, which is *not* a
  preference category). Each category also carries a frequency: `realtime` / `daily_digest` /
  `weekly_digest`. Missing row = defaults (email + in-app on, push off).
- **Email:** `lib/email.ts` (Resend). Bulk email injects `List-Unsubscribe` headers and a
  `buildUnsubscribeUrl` link (HMAC tokens, `lib/unsubscribe-tokens.ts`, `UNSUBSCRIBE_SECRET`).
- **Web push:** `lib/push.ts` → `sendPushToProfile(...)` (web-push + VAPID keys; prunes dead
  subscriptions). Service worker at `public/sw.js`.

## Key lib modules

| Module | Responsibility |
|---|---|
| `lib/auth.ts` | Caller identity helpers (see above) |
| `lib/core/roles.ts` | The two role axes and their comparisons |
| `lib/action-result.ts` | Server-action result contract |
| `lib/cron-auth.ts` | Fail-closed cron authorization |
| `lib/observability/cron-heartbeat.ts` | Cron dead-man's-switch wrapper |
| `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/client.ts`, `lib/supabase/public.ts` | Supabase clients, typed with the generated `Database` |
| `lib/database.types.ts` | Generated DB types. Regenerate with `npx supabase gen types typescript --linked > lib/database.types.ts` |
| `lib/comms/send-gate.ts` | The one outbound send decision |
| `lib/notification-preferences.ts` | `shouldSend` + per-category frequency |
| `lib/email.ts`, `lib/push.ts` | Send channels |
| `lib/queue/outbox.ts` | Durable job queue drained by `process-queue` |
| `lib/rewards`, `lib/economy`, `lib/season-ranks.ts`, `lib/achievements.ts` | Rewards Economy v3 (ADR-305) |
| `lib/event-recurrence.ts` | Materialised recurring-event occurrences |
| `lib/digest.ts` | Weekly digest assembly |
| `lib/discover.ts`, `lib/jsonld.ts`, `lib/site.ts` | Public SEO/AEO layer |
| `lib/studio` | Entity manifests + the wizard kernel ([STUDIO.md](STUDIO.md)) |
| `lib/ai/voice.ts` | The voice primer injected into every AI generation path |

## Styling & design tokens (DAWN)

`app/globals.css` is the **single source of truth** for color, and the only file in `app/` or
`components/` that is a stylesheet at all. Raw hex appears *only* there. The flow:

1. `:root` (light) and `.dark` define semantic CSS variables (`--color-canvas`, `--color-text`,
   `--color-primary`, `--color-success`, `--color-info`, …).
2. The `@theme inline` block maps those into Tailwind v4 utilities, so components use classes like
   `bg-surface`, `text-muted`, `bg-info-bg text-info`.

Semantic families: surfaces (`canvas` / `surface` / `surface-elevated`), `border`, text (`text` /
`muted` / `subtle`), brand (`primary`, `signal`), states (`success`, `warning`, `danger`, `info`),
and the 10-color `rank-*` spectrum (each with a `-deep` and `-bright` variant).

**Adding a state color** means editing `app/globals.css` in three places (light `:root`, `.dark`,
and `@theme inline`), or the Tailwind utility won't be generated. Tailwind v4 only emits a utility
when its class string appears in scanned source, so `pnpm check:phantom` fails on a class no token
backs. After adding a token, restart the dev server / clear `.next` if the new utility doesn't show
up (the cache can serve a stale stylesheet).

## Local development

```
pnpm dev                 # Turbopack dev server
pnpm exec tsc --noEmit   # type check (a primary correctness gate)
pnpm lint                # eslint
pnpm test                # vitest, run once
pnpm backlog             # the one list, working view
pnpm check:authz         # a single contract guard; see package.json for the full check:* set
```

The safety nets, all run by `.github/workflows/ci.yml` on every PR, in three parallel jobs:

| Job | What it runs | ✅ Required by branch protection |
|---|---|---|
| `lint` | `pnpm lint` | ✅ |
| `test` | `pnpm test` — **~10,050 unit test cases across 809 files** (measured 2026-08-17), including the guards that migrated from the CI array into vitest so they cannot be forgotten (`scripts/guard-wiring.test.ts`, ADR-1011) | ✅ |
| `checks` | `pnpm exec tsc --noEmit` plus every source-only contract guard, aggregated so **all** failures report at once (ADR-962) | ✅ |

Two more gates live off the CI path on purpose:

- **Artifact gates run in `postbuild`, not CI**, because CI never builds — Vercel does.
  `check:build-budget`, `check:og-trace`, `check:cache-budget` and `check:shell-weight` measure the real
  output ([DEPLOY-SAFETY.md](DEPLOY-SAFETY.md), ADR-1003; the last two were promoted from `--warn-only`
  on 2026-08-19).
- **`pnpm test:rls`** (pgTAP RLS/RPC suite) runs via the manual `.github/workflows/db-tests.yml`
  workflow, and `pnpm check:cron-freshness` weekly via `.github/workflows/maintenance.yml`.

Change shared code carefully and keep the suite green.

## Database / migrations

Schema source of truth is `supabase/migrations/`. The CLI is project-local (`npx supabase ...`).
**Schema changes go via the Supabase dashboard / MCP and are mirrored as files in
`supabase/migrations/`; do not run `supabase db push`** until the migration baseline in
[WORKFLOW.md](WORKFLOW.md) ("Scaling to a team") is done — one shared database today. Inspect live
data with `npx supabase db query --linked "<sql>"`.

`pnpm check:migrations` compares the repo's migration set against the applied ledger as a **set,
not a count** — the 2026-08-12 incident was one file missing and one migration unapplied, which a
count reported as equal. See [DATABASE.md](DATABASE.md).
