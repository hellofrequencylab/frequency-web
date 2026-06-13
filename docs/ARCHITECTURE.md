# Architecture

Engineering overview for `frequency-web`. Pairs with [GLOSSARY.md](GLOSSARY.md) (domain
terms), [DATABASE.md](DATABASE.md) (schema), and [BACKLOG.md](BACKLOG.md) (what's left).

## Stack

- **Next.js 16** (App Router, Turbopack) — note: Next 16 renamed *Middleware* to
  *Proxy*. The root `proxy.ts` is correct; do **not** rename it to `middleware.ts`.
- **React 19**, **TypeScript** (strict; `noUnusedLocals` is off, so unused
  locals/imports are ESLint warnings, not type errors).
- **Supabase** (Postgres + Auth + Realtime) via `@supabase/ssr`.
- **Tailwind v4** — hand-written components against the DAWN semantic-token layer
  (`app/globals.css`); **no component library** (no shadcn/Radix in `package.json`).
  Icons via `lucide-react`. See ADR-011 in [DECISIONS.md](DECISIONS.md).
- Hosted on **Vercel**; cron via `vercel.json`.

### Domain & canonical URL

Production is served at the custom domain **`frequencylocal.com`** (apex; GoDaddy DNS →
Vercel; Supabase Site URL set to match). This host is hardcoded as the fallback in
a few server paths (invite signup link, admin auth `redirectTo`, privacy page).

Separately, `lib/site.ts` derives `SITE_URL` — used for **canonical tags, sitemap,
robots, OpenGraph, and JSON-LD** — from `NEXT_PUBLIC_SITE_URL`, falling back to
`https://frequency-web-three.vercel.app`. **If `NEXT_PUBLIC_SITE_URL` is not set in
the Vercel project, those SEO surfaces advertise the vercel.app domain even though
the app is served at frequencylocal.com** (canonical/sitemap drift). Set
`NEXT_PUBLIC_SITE_URL=https://frequencylocal.com` in Vercel — see BACKLOG.

## Directory map

```
app/
  (main)/            authenticated app shell (community sub-menu + features/admin sidebar — ADR-057)
    feed/ broadcast/ circles/ hubs/ nexuses/ channels/
    events/ messages/ people/ crew/ notifications/ settings/
    admin/           host+/janitor moderation & management
  api/
    cron/            6 Vercel Cron endpoints (see "Cron" below)
    unsubscribe/     RFC 8058 one-click unsubscribe
  unsubscribe/       no-auth unsubscribe landing page
  discover/          public, logged-out SEO/AEO read-only layer
lib/                 shared modules (see "Key lib modules")
components/          UI + client components
supabase/migrations/ SQL migrations (source of truth for schema)
docs/                this documentation
```

## Authorization model — READ THIS FIRST

There are **two** Supabase clients:

- `createClient()` (`lib/supabase/server.ts`) — request-scoped, respects the
  signed-in user's session and **RLS**.
- `createAdminClient()` (`lib/supabase/admin.ts`) — service-role, **bypasses RLS**.

`createAdminClient()` is used at ~115 call sites because most mutations need to
read/write across rows the user can't see under RLS. **Because it bypasses RLS,
authorization MUST be enforced in application code.** Every server action that
uses the admin client is responsible for its own authz check. Do not assume the
database will stop an unauthorized write — it won't.

> **Enforced in CI (ADR-246).** `scripts/check-authz-guards.mjs` (`pnpm check:authz`,
> run by the `ci` workflow) fails the build if a `'use server'` file uses
> `createAdminClient()` without establishing the caller / checking a capability /
> verifying a signed token. A genuinely public action opts out with `// authz-ok: <reason>`
> or the script's allowlist. This converts the rule above from convention into a gate.

**RLS convergence is underway (ADR-042).** Own-row and public reads are moving
back onto the session client (`createClient()`) so RLS enforces them — including
the caller-identity helpers below, which now read the caller's own profile via
the session client. Cross-user aggregate reads stay on the admin client until they
get `SECURITY DEFINER` RPCs + policy tests. When you add a read, prefer the session
client if RLS already covers it; reach for the admin client only for cross-user
aggregates, cron/webhooks, or admin-only surfaces.

The canonical caller-identity helpers live in `lib/auth.ts`:

- `getMyProfileId(): Promise<string | null>` — profile id, or null if anon.
- `requireProfileId(): Promise<string>` — profile id, or `redirect()` to
  `/sign-in` / `/onboarding`.
- `getCallerProfile(): Promise<{ id, community_role } | null>` — use when an
  action makes a **role-based** decision.

Role hierarchy (ascending): `member < crew < host < guide < mentor < janitor`.
Compare with the `HIERARCHY` array pattern: `HIERARCHY.indexOf(role) >= HIERARCHY.indexOf(min)`.

Two DB triggers harden `profiles` against self-edit from the browser anon
client: `prevent_role_self_escalation` blocks `community_role` changes, and
`prevent_economy_self_edit` blocks changes to the economy/rank/status/cosmetic
columns (zaps, gems, `current_season_rank`, `season_challenges_complete`,
`is_active`, `profile_border/flair`, `custom_title`, `profile_theme`). Both
allow the service role through, so legitimate writes via admin server actions
work; direct user UPDATEs to these columns are rejected.

## Server-action error contract

Three conventions coexist deliberately — pick by how the caller consumes the result.
The contract type and helpers live in `lib/action-result.ts`.

1. **`ActionResult<T> = { data: T } | { error: string }`** — for actions invoked
   imperatively whose success/failure the UI must show. Build with `ok(data?)` /
   `fail(msg)`; discriminate with `isError(result)`.
2. **`throw`** — for mutations the client wraps in `try/catch`. (Note: in
   production Next.js *redacts* thrown messages to a generic digest; the real
   text is only in Vercel function logs.)
3. **void + `redirect(...)`** — for actions that navigate on completion.

## Cron

Endpoints under `app/api/cron/`, scheduled in `vercel.json`. The originals:
`event-reminders` (*/15m), `lifecycle-triggers` (daily), `weekly-digest`
(Sun 14:00), `event-occurrences` (daily 02:00), `publish-scheduled`, and
`process-queue` (*/2m, drains the outbox/notification queue). Later additions
ride the same pattern — notably the Rewards Economy v2 pair (ADR-219):
`coop-pulse` (daily 00:50 UTC — Co-op Pulse grants + Carrier Wave + Co-op
Synchrony for the just-completed day) and `practice-streaks` (daily 01:10 UTC —
per-practice consistency ladder, Full Cycle payouts, and the rank/journey
cosmetic grant sweeps).

All authenticate via `rejectUnauthorizedCron(req)` in `lib/cron-auth.ts`, which is
**fail-closed**: a missing `CRON_SECRET` in production rejects every request.
(Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.) Dev allows an unset
secret for local runs.

## Notifications, email, push

- **Preferences:** `lib/notification-preferences.ts` → `shouldSend(profileId,
  channel, category)`. Channels: email / inapp / push. Categories: dispatches,
  events, mentions, lifecycle. Missing row = defaults (email+inapp on, push off).
  Gate every non-transactional send site with `shouldSend`.
- **Email:** `lib/email.ts` (Resend). Bulk emails inject `List-Unsubscribe`
  headers and a `buildUnsubscribeUrl` link (HMAC tokens, `lib/unsubscribe-tokens.ts`,
  `UNSUBSCRIBE_SECRET`).
- **Web push:** `lib/push.ts` → `sendPushToProfile(...)` (web-push + VAPID keys;
  prunes dead subscriptions). Service worker at `public/sw.js`.

## Key lib modules

| Module | Responsibility |
|---|---|
| `auth.ts` | Caller identity helpers (see above) |
| `action-result.ts` | Server-action result contract |
| `cron-auth.ts` | Fail-closed cron authorization |
| `supabase/{server,admin,client,public}.ts` | Supabase clients (typed with generated `Database`) |
| `database.types.ts` | Generated DB types — regenerate with `npx supabase gen types typescript --linked > lib/database.types.ts` |
| `notification-preferences.ts` | `shouldSend` gate |
| `email.ts` / `push.ts` | Send channels |
| `gems.ts` / `achievements.ts` / `gamification.ts` / `season-ranks.ts` | Gamification (zaps, ranks, achievements) |
| `event-recurrence.ts` | Materialised recurring-event occurrences |
| `digest.ts` | Weekly digest assembly |
| `discover.ts` / `jsonld.ts` / `site.ts` | Public SEO/AEO layer |

## Styling & design tokens (DAWN)

`app/globals.css` is the **single source of truth** for color. Raw hex appears
*only* there. The flow is:

1. `:root` (light) and `.dark` define semantic CSS variables (`--color-canvas`,
   `--color-text`, `--color-primary`, `--color-success`, `--color-info`, …).
2. The `@theme inline` block maps those into Tailwind v4 utilities, so
   components use classes like `bg-surface`, `text-muted`, `bg-info-bg text-info`.

Semantic families: surfaces (`canvas`/`surface`/`surface-elevated`), `border`,
text (`text`/`muted`/`subtle`), brand (`primary`, `signal`), states (`success`,
`warning`, `danger`, `info`), and the 10-color `rank-*` spectrum.

**Adding a state color** means editing globals.css in three places — light
`:root`, `.dark`, and `@theme inline` — or the Tailwind utility won't be
generated. Tailwind v4 only emits a utility when its class string appears in
scanned source. After adding a token, restart the dev server / clear `.next` if
the new utility doesn't show up (the cache can serve a stale stylesheet).

## Local development

```
npm run dev        # Turbopack dev server
npx tsc --noEmit   # type check (the project's main correctness gate)
npx eslint <paths> # lint
```

There is **no test framework** in this repo. `tsc` + `eslint` + manual
verification are the only safety nets — change shared code carefully.

## Database / migrations

Schema source of truth is `supabase/migrations/`. The CLI is project-local
(`npx supabase ...`). Before `db push`, run `npx supabase migration list` and
`--dry-run`; repair untracked-but-applied migrations with
`migration repair --status applied <id>` first. Inspect live data with
`npx supabase db query --linked "<sql>"`. See [DATABASE.md](DATABASE.md).
