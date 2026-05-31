# Launch runbook (free beta on findafreq.com)

The code and database are ready; what remains is **config** (domain + env) and opening
the beta. The domain switch is env-only in code (`lib/site.ts` reads
`NEXT_PUBLIC_SITE_URL`), so nothing here needs a code change. Ops doc; git is the home.

## 1. Pre-flight (done)

- The 5 migrations are applied to prod (`zap_config`, `practices`, `seasons`,
  `blocked_users`, plus the `agent_actions` backfill). Verify: `npx supabase migration list`
  shows all applied (Local and Remote match).
- Feature work is merged to `main`; Vercel auto-deploys `main`.

## 2. Apex cutover (go.findafreq.com to findafreq.com)

1. **Vercel, Project, Domains:** add `findafreq.com` (and `www.findafreq.com`).
2. **DNS:** point `findafreq.com` at Vercel using the records Vercel shows (A / ALIAS, and
   a CNAME for www). Leave `go.findafreq.com` working during the transition if you like.
3. **Set prod env (Vercel, Settings, Environment Variables, Production):**
   - `NEXT_PUBLIC_SITE_URL = https://findafreq.com`
   - `NEXT_PUBLIC_APP_URL = https://findafreq.com`
4. **Redeploy** (env changes need a fresh deploy).
5. **Verify:** page canonical tags, `robots.txt`, `sitemap.xml`, and OG images all show
   `findafreq.com` (they all derive from `NEXT_PUBLIC_SITE_URL`).

## 3. Production env checklist

| Var | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | DB + admin client | already set (prod works) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | canonical URLs; email + ICS links | set to `https://findafreq.com` |
| `RESEND_API_KEY` / `EMAIL_FROM` | transactional + digest email | `EMAIL_FROM` on `findafreq.com` |
| `CRON_SECRET` | cron auth (fail-closed: crons reject without it) | required or reminders/digests/scheduled publish silently stop |
| `UNSUBSCRIBE_SECRET` | signed one-click unsubscribe tokens | email compliance |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | web push | push notifications |

## 4. Email deliverability (before sending volume)

Verify `findafreq.com` in Resend with **SPF, DKIM, DMARC** (ROADMAP P7.28), set `EMAIL_FROM`
to a `findafreq.com` address, and send a test welcome email. Gmail/Yahoo bulk-sender rules
need these or mail lands in spam.

## 5. Crons

Defined in `vercel.json` (scheduled publish every 5 min, lifecycle daily, event occurrences
daily, event reminders every 15 min, weekly digest Sundays 14:00 UTC, queue drain). They
**fail closed without `CRON_SECRET`**, so confirm it's set after the deploy.

## 6. Beta-open smoke test (on findafreq.com)

- Sign up as a fresh user; the Getting Started funnel appears (photo, circle, adopt a
  practice, log a practice).
- Find a circle, or **start one** around an Interest, and set its weekly practice.
- **Log a practice**: see the reward toast; confirm WAM increments on the admin/analytics
  surface.
- Block then unblock a member; delete a throwaway account.
- `/help`, `/programs`, `/practices` load; "Circles near you" prompts for location.

## 7. Known, non-blocking

- **Lint debt:** about 76 pre-existing repo-wide `@typescript-eslint/no-explicit-any` errors
  plus a couple of RSC `Date.now()` purity flags. Not introduced by recent work and they
  have never blocked a Vercel build. Optional later: a dedicated typed-refactor pass, or
  relax `no-explicit-any` to `warn` in `eslint.config.mjs` for cheap green CI. Not a launch
  blocker.
- **The freemium Vault / membership / Lab bridge is Stage D** (needs billing + proven PMF),
  captured in ADR-037/038, deliberately not built yet. Lifecycle rewards already record to
  the ledger, so the Vault is a later branch with no rework.

## What "live" means after this

A visitor at `findafreq.com` can sign up, find or start a local circle, adopt and log a
practice (your WAM North Star), and you can watch the retention loop. That is the beta.
