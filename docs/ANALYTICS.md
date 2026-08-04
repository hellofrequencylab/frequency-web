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

There is one deliberate **third stream** beside those two: **anonymous Core Web Vitals**
([ADR-922](DECISIONS.md)). `components/analytics/web-vitals.tsx` (mounted in the ROOT layout, so
anonymous marketing/discover/help traffic is covered) buffers LCP/INP/CLS/FCP/TTFB per page load →
`POST /api/vitals` → `interaction_events` rows with **`profile_id` NULL and `surface` NULL**, so both
member rollups ignore them by their existing filters. Vitals describe the page + device, never the
person — that is what keeps this stream **outside the `analytics` consent scope** (account-tied data);
adding a profile id here would immediately require the gate. Paths are templated (`/circles/:id`),
`props.mid` (the per-page-load metric id) dedupes retried beacons, the 90-day purge bounds the table,
and Sentry's incidental vitals (tracing default) are NOT the dashboard source of truth — this is.

## The journey registry — five funnels over the markers that already exist (Lift 1a)

`lib/analytics/journeys.ts` names the five journeys that decide the product's fate and, for
each step, **which existing marker proves it**. No new tracking: the semantic ledger is live,
and the registry only makes it queryable as a funnel. `/admin/insights?tab=experience` reads it.

| Key | Funnel | Steps (marker → marker) |
|---|---|---|
| `land_to_beta` | Land to beta | `web_vital` · `web_vital` (path `/beta%`) · `waitlist.joined`/`application.submitted` · 🔴 `account.created` · `onboarding.induction_completed` |
| `join_to_circle` | Join to first Circle | `onboarding.induction_completed` · `onboarding.vera_opened` · `nav.page_view` (path `/circles%`) · `circle.joined`/`circle.started`/`circle.claimed` |
| `circle_to_rsvp` | First Circle to first RSVP | `circle.joined`/`circle.started`/`circle.claimed` · `nav.page_view` (path `/events%`) · 🔴 `event.rsvp` |
| `practice_to_return` | First practice to the return | `practice.adopted`/`practice.claimed` · `practice.verified` · `practice.verified` within 7 days |
| `claim_to_published` | Operator: claim to published | `circle.claimed`/`event.claimed` · `nav.page_view` (path `%/manage%`) · `event.posted`/`entry_point.created` |

**Coverage is a first-class value, not an assumption.** Each step carries `observed` (rows
exist in prod), `emitted` (an emitter exists, no rows yet), or `unimplemented` (🔴 nothing
emits it). Two steps are 🔴 today and the readout says so rather than printing a zero:

| Gap | Why it matters | Fix |
|---|---|---|
| 🔴 `account.created` | Registered in the taxonomy, never emitted. Sign-up leaves no ledger row, so waitlist → induction is a black box. | One `track('account.created', …)` on the profile-creation path. |
| 🔴 `event.rsvp` | Registered in the taxonomy, never emitted: an RSVP writes an `event_rsvps` row and stops. J3 cannot close. | One `track('event.rsvp', { eventId }, profileId)` beside the `event_rsvps` insert. |

**The identity seam.** `engagement_events` is keyed by profile; the anonymous vitals stream is
keyed only by an ephemeral per-tab session id, and the two can never be joined (joining them
would drag the vitals stream inside the `analytics` consent scope, ADR-922). `land_to_beta`
crosses that seam, so the funnel **restarts the walk there** and reports `linked=false`; the
readout draws a break instead of a fabricated conversion rate.

**Reads:** `journey_funnel(_journey_key, _steps jsonb, _days)` — a SEQUENTIAL funnel (a subject
counts at step N only if it counted at step N-1 and its step-N event came after). The step spec
is passed in from the registry, so **SQL holds no second copy** of the journey definitions.

## Vitals budgets + the readout (Lift 7)

`lib/analytics/vitals-budgets.ts` holds per-template-class p75 budgets, keyed to the templated
path names the vitals stream already records (`templatePath`, ADR-922) so nothing new is stored:

| Class | LCP p75 | INP p75 | CLS p75 | Surfaces |
|---|---|---|---|---|
| `marketing` | ≤ 2.0s | ≤ 200ms | ≤ 0.1 | the (marketing) group, `/`, `/help`, legal, and the public entity profiles (`/spaces/<slug>`, `/events/:id`, `/people/<handle>`) |
| `app` | ≤ 2.5s | ≤ 200ms | ≤ 0.1 | the signed-in shell (`/feed`, `/circles`, `/practices`, `/settings/*`, …) — also the default for anything unclassified |
| `operator` | ≤ 2.5s | ≤ 300ms | ≤ 0.1 | `/admin/*`, `/studio`, and anything containing `/manage` or `/edit` |

Lift 7a names marketing's three, the app shell's LCP+INP, and the operator INP. The rest are
inherited rather than left blank so the table can be scored: CLS 0.1 is universal, and only INP
is relaxed for operators. Status per docs/PRESENTATION.md — ✅ under budget, ⚠️ within 10% of it,
🔴 over, ⏳ fewer than `MIN_SAMPLES` (5) loads, which is left unscored rather than guessed at.

**Read:** `vitals_p75(_days, _path_template, _viewport)` — p75 per (templated path, metric) over
`interaction_events kind='web_vital'`, plus the same statistic over the **preceding window of
equal length**, which is the 28-day trend the readout prints beside each number.

Both RPCs are `SECURITY DEFINER`, granted to `service_role` ONLY (so neither is reachable on
`/rest/v1/rpc` at all), with an in-body staff check as defense in depth — the posture of
`public.delete_topical_channel`. Neither returns a profile id, a session id, or any row-level
detail. Migration: `supabase/migrations/20270207000000_insights_journey_and_vitals_rpcs.sql`.

### `viewport_class` on the vitals beacon (Lift 7d)

A phone and a desktop are two different products at the same URL, and a blended p75 hides
whichever one is losing. Each vital now carries a `viewportClass` of `mobile` / `tablet` /
`desktop`, derived from viewport WIDTH at first metric (Tailwind's md/lg breakpoints) and
stored as `props.vp`. **Account-free by construction** — a bucket of three is a property of the
page view, never of a person, which is exactly what keeps this stream outside the `analytics`
consent scope (the ADR-922 invariant). `vitals_p75` takes it as an optional filter and is
correct both before and after the collector starts writing it.

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
- **Experience** ✅ — `/admin/insights?tab=experience`: the five journey funnels and the page-speed
  budget table (above). Two panels, each behind its own `<Suspense>`; the tab component lives at
  `app/(main)/admin/insights/experience-tab.tsx`, the reads at `lib/analytics/insights-read.ts`.
  No new menu row: `/admin/insights` is already a rail-bank destination, and this is a tab on it.

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
