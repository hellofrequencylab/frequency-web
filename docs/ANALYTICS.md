# Analytics — first-party tracking + admin dashboard (and GA4)

Status: **design.** GA4 acquisition tag is **shipped** (ADR-048). This doc specs the
**first-party event layer + admin dashboard** and how GA4 is "fully embedded." Decision:
[DECISIONS.md ADR-050](DECISIONS.md).

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
- **Server side** → insert into `engagement_events` (authoritative, idempotent where it matters).
- **Client side** → fire the matching **GA4 custom event** via `gtag` (so GA funnels are rich,
  not just pageviews).
The helper is the *only* sanctioned way to record an analytics event; ad-hoc `gtag()` calls are
disallowed so coverage stays complete and consistent.

## Event taxonomy (canonical)

Every key action in the member journey emits a named event. Initial set:

| Event | Emitted when | Key props |
|---|---|---|
| `account.created` | new auth user / profile row | source (oauth/email) |
| `onboarding.step_viewed` | a tour coachmark shows | step id |
| `onboarding.step_completed` | a tour step's action done | step id |
| `profile.completed` | name/handle/avatar set | which fields |
| `circle.joined` | membership becomes active | circle id, scope |
| `event.rsvp` | RSVP created | event id |
| `practice.adopted` / `practice.logged` | WAM loop | practice id |
| `post.created` | a post is published | scope, type |
| `invite.sent` / `invite.accepted` | invite lifecycle | channel |
| `session.active` | meaningful session start | — |

(Extends as features land; the taxonomy lives in one module so it's reviewable.)

## Admin dashboard (Studio)

A dashboard surface in the admin/Studio area, reading first-party aggregates (via SQL
aggregates / `SECURITY DEFINER` RPCs, not raw scans). Panels:
- **Activation funnel** — onboarding step-by-step drop-off (where new members stall in the tour).
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
