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

Production is served at the custom domain **`go.findafreq.com`** (GoDaddy CNAME →
Vercel; Supabase Site URL set to match). This host is hardcoded as the fallback in
a few server paths (invite signup link, admin auth `redirectTo`, privacy page).

Separately, `lib/site.ts` derives `SITE_URL` — used for **canonical tags, sitemap,
robots, OpenGraph, and JSON-LD** — from `NEXT_PUBLIC_SITE_URL`, falling back to
`https://frequency-web-three.vercel.app`. **If `NEXT_PUBLIC_SITE_URL` is not set in
the Vercel project, those SEO surfaces advertise the vercel.app domain even though
the app is served at go.findafreq.com** (canonical/sitemap drift). Set
`NEXT_PUBLIC_SITE_URL=https://go.findafreq.com` in Vercel — see BACKLOG.

## Directory map

```
app/
  (main)/            authenticated app shell (sidebar layout)
    feed/ broadcast/ circles/ hubs/ nexuses/ channels/
    events/ messages/ people/ crew/ notifications/ settings/
    admin/           host+/janitor moderation & management
  api/
    cron/            5 Vercel Cron endpoints (see "Cron" below)
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

`createAdminClient()` is used at ~200 call sites because most mutations need to
read/write across rows the user can't see under RLS. **Because it bypasses RLS,
authorization MUST be enforced in application code.** Every server action that
uses the admin client is responsible for its own authz check. Do not assume the
database will stop an unauthorized write — it won't.

The canonical caller-identity helpers live in `lib/auth.ts`:

- `getMyProfileId(): Promise<string | null>` — profile id, or null if anon.
- `requireProfileId(): Promise<string>` — profile id, or `redirect()` to
  `/sign-in` / `/onboarding`.
- `getCallerProfile(): Promise<{ id, community_role } | null>` — use when an
  action makes a **role-based** decision.

Role hierarchy (ascending): `member < crew < host < guide < mentor < janitor`.
Compare with the `HIERARCHY` array pattern: `HIERARCHY.indexOf(role) >= HIERARCHY.indexOf(min)`.

A DB trigger (`prevent_role_self_escalation`) blocks any `profiles.community_role`
change unless made by the service role, so role changes must go through admin
actions.

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

Five endpoints under `app/api/cron/`, scheduled in `vercel.json`:
`event-reminders` (*/15m), `lifecycle-triggers` (daily), `weekly-digest`
(Sun 14:00), `event-occurrences` (daily 02:00), `publish-scheduled`.

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
