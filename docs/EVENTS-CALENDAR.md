# Events calendar — plan of record

**Status:** EC1–EC3 shipped; EC4 (engagement polish) remaining. Decisions: [ADR-800](DECISIONS.md#adr-800),
[ADR-802](DECISIONS.md#adr-802). Owner ask: a
fully-featured per-space events calendar that ties into a primary Frequency-wide calendar, with a
month grid, a click-to-preview popup, a "Go to Event" jump, and guest-subscribable feeds that drop
into any calendar app.

Lead with the answer: **most of the hard infrastructure already exists and is correct.** The event
model, the timezone engine, the per-event `.ics`, the 3-touch reminders, recurrence, and JSON-LD are
all built. The real gaps are a **grid view**, an **event popup**, **mounting** the subscribe
affordance that already exists, and **fixing one real timezone bug** in the subscribable feed. This
plan sequences those into shippable phases.

## 1. What good calendars do (research → what we adopt)

The patterns that consistently drive engagement on community/event calendars (Luma, Partiful,
Meetup, Google Calendar, Eventbrite), and the call for each:

| Pattern | Why it engages | Our call |
|---|---|---|
| **Month grid + list toggle** | The grid is the mental model people expect; the list is how they actually scan "what's next" | Build both; default to the grid, keep the existing list/map as toggles |
| **Click for a quick peek, not a full navigation** | A popup keeps the browsing context; a full page load loses their place in the month | Truncated popup with the essentials + a **Go to Event** link out |
| **One-tap subscribe that stays in sync** | A live feed beats a one-off download; people add once and forget | Public per-space `webcal://` feed + the existing per-member feed; mount the built-but-orphaned `CalendarSubscribe` |
| **Correct times in the viewer's own zone** | A calendar that shows the wrong time is worse than none | Already solved for per-event; **fix the feed** (see EC1) so subscriptions match |
| **A single "everything" calendar** | Discovery: one place to see all public happenings | Master Frequency calendar (EC2) over all public events |
| **Shared events appear everywhere they belong** | A co-hosted event should surface on every host's calendar | Co-host model (EC3), converges with collaborator spaces B2 |
| **Reminders before the event** | The re-engagement touch that gets people to actually show up | Already built (7d/24h/2h cron, tz-correct); extend to feed subscribers in EC4 |
| **Add-to-calendar on every event** | Removes the friction between "interested" and "committed" | Per-event `.ics` exists and is mounted (`AddToCalendar`) |

Anti-patterns we avoid: a blank-canvas calendar with no default view; times that silently assume one
zone; a subscribe button that downloads a dead snapshot; burying the grid behind a filter.

## 2. What already exists (do not rebuild)

- **Event model + tenancy** — `events` table; `space_id` is the tenancy axis (`lib/events/store.ts`
  `listEventsForSpace`), `host_id` authorship, `scope_type/scope_id` the community scope. Visibility
  `public|unlisted|circle_only|private`; `status draft|published`.
- **Timezone engine** — `lib/time/zone.ts`. `starts_at/ends_at` store wall-clock-as-UTC-parts,
  interpreted in `events.time_zone`. `eventInstant()` resolves the true instant. NEVER stamp the
  stored string directly.
- **ICS** — per-event `.ics` (`app/events/[slug]/event.ics`), tz-correct, masks non-public events.
- **Subscribable member feed** — `event_calendar_follows` (one token/member) + `event_calendar_feed`
  RPC + `app/events/calendar/[token]` route.
- **Subscribe UI** — `components/events/calendar-subscribe.tsx` (+ menu). **Built but never mounted.**
- **Reminders** — `app/api/cron/event-reminders` (7d/24h/2h, idempotent, tz-correct, pref-gated).
- **Recurrence** — enum model (ADR-007), materialized child rows; read helpers in
  `lib/events/recurrence.ts`.
- **JSON-LD** — `lib/jsonld.ts` `eventSchema` / `eventsListingSchema`.
- **Shared ICS builders (EC1, new)** — `lib/events/ics.ts`: `icsStamp` / `icsEscape` / `foldLine` /
  `icsEventInstants` / `buildVevent` / `renderCalendar`. The one timezone seam for every feed.

## 3. The phased build

### EC1 — feeds correct + per-space subscribe (this PR)
- Extract the duplicated ICS helpers into a tested `lib/events/ics.ts` (the timezone contract lives
  in `icsEventInstants`).
- **Fix the feed timezone bug:** `app/events/calendar/[token]` stamped `starts_at` raw, so every
  subscribed event was 7-8h off. Route it through `icsEventInstants`; add `time_zone` to the
  `event_calendar_feed` RPC (migration `20261193000000`).
- **Public per-space feed:** `space_public_calendar_feed(space_id)` RPC +
  `app/spaces/[slug]/calendar.ics` route — a guest-subscribable feed of a space's published,
  public/unlisted events (same redaction as the public event page), gated on the space being
  network-visible + active.

### EC2 — the grid view + popup + mounting subscribe ✅ (shipped)
- A month-grid calendar (`components/events/event-calendar.tsx`) over the pure, unit-tested grid math
  in `lib/events/calendar-grid.ts` (month matrix + event bucketing by the event's own stored day).
  Client-side month nav over a server-loaded window.
- A truncated **event popup** on click (title, when, where) with a **Go to Event** link to
  `/events/<slug>`. Built on the shared `Dialog` primitive.
- A per-space **Calendar tab** (`app/(main)/spaces/[slug]/(profile)/calendar`), gated on the Space
  having upcoming events, reading `listSpaceCalendarEvents` (published, non-private, non-cancelled).
- Mounted the subscribe affordance (`CalendarSubscribeMenu`) pointing at the EC1 public per-space feed
  `/spaces/<slug>/calendar.ics`.
- Times are pre-formatted server-side (via `formatEventWhen`) so the timezone lib never ships to the
  client. Follow-up: a viewer-zone toggle, RSVP counts + covers in the popup, and a list/map toggle.

### EC3 — the master Frequency calendar + shared events ✅ (shipped)
- **Master Frequency calendar + feed.** `public_calendar_feed()` (migration `20261196000000`) — the
  network-wide discovery calendar: ALL upcoming published **public** (never `unlisted` — the master
  feed is discovery, not link-reachable), non-cancelled events, and only from network-visible active
  spaces (platform events with `space_id IS NULL` included). `SECURITY DEFINER`, anon-callable, and
  **self-gated in-function** (it takes no argument, so the redaction contract lives entirely in the
  RPC — there is no route gate to lean on). The `.ics` route is `app/events/calendar.ics` (a distinct
  path from the token feed at `app/events/calendar/[token]`); the grid page is
  `app/(main)/events/calendar` (composes `IndexTemplate`), and both share ONE read
  (`listPublicCalendarEvents` → the same RPC) so grid and feed can never drift. A **Calendar** link
  sits in the shared events header (`components/marketplace/events-header-actions.tsx`).
- **Shared / co-hosted events (delivers collaborator B2).** `event_space_shares` (migration
  `20261197000000`) — a request→approve handshake letting an event appear on ANOTHER space's calendar
  without moving where it lives (`events.space_id` is unchanged; the row IS the relationship, like
  `space_collaborations`). Two entry points: the event host **invites** a space (its stewards
  approve), or a space steward asks to **feature** an event (the host approves). Either **auto-accepts**
  when the caller already stewards the approving side, or an accepted `space_collaboration` already
  links the two spaces. Reads/resolvers in `lib/events/event-share.ts`; writes in
  `app/(main)/events/share-actions.ts`; host field `components/events/event-share-field.tsx` (beside
  the placement field), approver surface `components/events/event-share-approvals.tsx` (in the space
  manage console beside placement approvals).
- **The leak contract.** An accepted share is a NECESSARY, never SUFFICIENT, condition to surface an
  event. Every reader re-applies the event's OWN visibility gate on its OWN row — the two feed RPCs
  (`space_public_calendar_feed`'s UNION branch, `public_calendar_feed`) and the store
  (`listSpaceCalendarEvents` / `spaceHasPublicUpcomingEvents` UNION accepted shares, gated by the pure
  `passesCalendarGate`). So flipping a shared event to private/circle_only/draft, or cancelling it,
  removes it from every co-host calendar immediately. `event_space_shares` is RLS-enabled with no
  policies (service-role only, listed in `scripts/rls-deny-all.txt`); status transitions are atomic
  (status-guarded `WHERE`).

### EC4 — engagement polish
- RRULE export for recurring series (currently materialized rows export as separate VEVENTs).
- Reminders for feed subscribers who have not RSVP'd (opt-in), reusing the reminder cron.
- Saved views / "add to my calendar" nudges, "N going" social proof on the grid.

## 4. Key decisions

- **The timezone contract has exactly one seam** (`icsEventInstants`). Every feed route builds
  DTSTART/DTEND from it, never from `new Date(row.starts_at)`. This is why the feed bug happened
  (the per-event route was fixed in isolation; the feed drifted).
- **The public per-space feed exposes only what the public event page does** — published,
  public/unlisted, non-cancelled — and only for a network-visible, active space. The visibility/status
  gate is co-located **inside** `space_public_calendar_feed` (it joins `spaces` on
  `visibility='network' AND status='active'`), not only in the route: the RPC is `SECURITY DEFINER`
  and anon-callable directly via PostgREST, so the model must be self-protecting. The route re-checks
  for a clean 404 + the calendar title (defense in depth).
- **Slug-keyed public feed, token-keyed private feed.** The space feed is public events, so the
  human-readable slug is the identifier (no token). The member feed stays token-gated (it contains
  the member's private RSVPs + venues).
- **Calendar surfaces compose the page framework** (`IndexTemplate` for the grid; the rail falls
  through to `'global'` — no `page-chrome` edit needed).

Voice: all calendar copy follows `docs/CONTENT-VOICE.md` (no em/en dashes) + `docs/NAMING.md`.
