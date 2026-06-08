# Analytics — first-party tracking + admin dashboard (and GA4)

Status: **design.** GA4 acquisition tag is **shipped** (ADR-048); the **dual-emit `track()` helper
+ taxonomy + page-view capture are shipped** (ADR-070, [ENGAGEMENT-MARKETING-ENGINE.md](ENGAGEMENT-MARKETING-ENGINE.md)
Phase A) — the admin dashboard (below) is the remaining build. This doc specs the **first-party
event layer + admin dashboard** and how GA4 is "fully embedded." Decision: [DECISIONS.md ADR-050](DECISIONS.md).

## Goal

Accurate, **real-time** product & community analytics on an **admin dashboard inside the app**,
plus rich acquisition data in GA4. As much faithful tracking as possible across the whole member
journey.

## Architecture principle (important)

**GA4 is the wrong source for an accurate admin dashboard** — it's sampled, delayed, and
acquisition-shaped. So we split by job:

- **First-party = source of truth for the dashboard.** Our own `engagement_events` (already the
  WAM/retention backbone) is accurate and live. The admin dashboard reads from it — never from GA.
- **GA4 = acquisition.** Where traffic comes from, devices, referrers — viewed in GA's UI, and/or
  surfaced in the dashboard via the GA Data API.

## Dual-emit tracking helper

One call, both systems. A single `track(event, props)` helper so we never instrument twice and
the two systems can't drift:
- **Server side** → insert into `engagement_events` (authoritative, idempotent where it matters),
  **and mirror to GA4 via the Measurement Protocol** (`lib/analytics/ga-server.ts`, ADR-093) so
  server-authoritative events that never touch the browser — QR scans (`/q` redirects off-site),
  referral attribution at onboarding, gift-a-zap — still reach GA. `actorProfileId` → GA `client_id`
  + `user_id`.
- **Client side** → fire the matching **GA4 custom event** via `gtag` (so GA funnels are rich,
  not just pageviews).
The helper is the *only* sanctioned way to record an analytics event; ad-hoc `gtag()` calls are
disallowed so coverage stays complete and consistent. Both mirrors are inert unless the GA env vars
are set in production.

## Two streams: semantic events vs. the raw firehose (PI.1, [ADR-166](DECISIONS.md))

`track()`/`engagement_events` is the **semantic** stream — named, reviewable, business-meaningful
events (one row per join / RSVP / verified practice), the source of truth for dashboards and rewards.

Alongside it runs the **raw interaction firehose** — `interaction_events`, the high-volume twin for
the fine-grained behavioral signal the AI + reward engine read history from:

- **Client buffer** `lib/analytics/observe.ts` — `observe(kind, props)` BATCHES events and flushes
  in bulk via `sendBeacon` (interval · buffer-full · page-hide). Unlike `trackClient` (one POST per
  event), this is built for volume.
- **Auto-capture** `components/analytics/observe-provider.tsx` (mounts beside `PageViewTracker`):
  view · dwell · scroll-depth milestones · rage-click · visibility. Explicit signals call `observe()`.
- **Sink** `POST /api/observe` — batch, member-tied, **consent-gated** (`analytics` scope), service-
  role bulk insert. The `kind` taxonomy is **open** (`lib/analytics/interaction-events.ts`): any safe
  slug is accepted, so a new signal needs no migration. **Retention-bounded** — raw rows are purged
  after `INTERACTION_RETENTION_DAYS` (90) by the nightly cron; the durable aggregate is the PI.2
  rollups. Use this for *behavioral telemetry*; keep `track()` for *semantic events*.

## Event taxonomy (canonical)

Every key action in the member journey emits a named event. Initial set:

| Event | Emitted when | Key props |
|---|---|---|
| `account.created` | new auth user / profile row | source (oauth/email) |
| `onboarding.induction_completed` ✅ | beta induction finished | hasAvatar, hasIntent |
| `onboarding.vera_opened` ✅ | reached the Vera concierge | — |
| `onboarding.step_viewed` | a tour coachmark shows | step id |
| `onboarding.step_completed` | a tour step's action done | step id |
| `profile.completed` ✅ | name/handle/avatar set | hasAvatar |
| `circle.joined` ✅ | membership becomes active | circle id |
| `event.rsvp` | RSVP created | event id |
| `practice.adopted` ✅ / `practice.verified` ✅ | WAM loop | practice id |
| `post.created` | a post is published | scope, type |
| `invite.sent` / `invite.accepted` | invite lifecycle | channel |
| `session.active` | meaningful session start | — |

(Extends as features land; the taxonomy lives in one module so it's reviewable.)

## Admin dashboard (Studio)

A dashboard surface in the admin/Studio area, reading first-party aggregates (via SQL
aggregates / `SECURITY DEFINER` RPCs, not raw scans). Panels:
- **New-member activation funnel** ✅ — induction → Vera → first circle → adopt → verify practice
  (`activationFunnel` in `lib/analytics/dashboard.ts`, surfaced on `/admin/engagement`). The ✅ events
  above are now emitted server-side via `track()`, so this funnel reflects real drop-off (ADR-075).
- **WAM & retention** — the North Star + cohort retention.
- **Community health** — circles forming/active, events, posts, invites.
- **Acquisition** — GA4 headline numbers (traffic, top sources) via the GA Data API widget, or a link out.
- **Realtime** — active members now.

There is likely an existing admin/WAM surface to extend rather than build fresh — confirm at
build time.

## GA4 "fully embedded"

- The **dual-emit helper** fires GA4 custom events on the same actions above, so GA's funnels
  and audiences reflect real product behavior, not just page views (GA4 Enhanced Measurement
  already covers SPA route changes — ADR-048).
- **Acquisition in the dashboard:** pull GA's headline metrics through the **GA Data API**
  (service account; this is what the Google Analytics MCP also uses) as a dashboard widget — or,
  simplest, link out to GA. Open decision.

## Privacy

- First-party events are internal product telemetry tied to the member's own account — no
  *additional* cookies, no new consent surface.
- GA4 stays per ADR-048 (anonymized, ad signals off). EU/UK consent banner still deferred.

## Dependencies / notes
- Builds on the existing `engagement_events` backbone and the GA4 tag (ADR-048).
- Performance: aggregates / materialized views for the dashboard as volume grows.
- Feeds **Vera's memory** ([AI-VERA.md](AI-VERA.md)) from the same event stream — one source,
  two consumers (dashboard + AI).

## Open decisions
- GA acquisition data **embedded via GA Data API** vs **linked out**.
- Dashboard metric priorities for v1.
- Client-vs-server split for each event (some only exist server-side).
