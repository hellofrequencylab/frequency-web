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
  having upcoming events, reading `listSpaceCalendarEvents` (published, non-private). Cancelled
  gatherings paint as muted footer text on the date square (LIVE-414); the subscribed `.ics` stays
  live-only.
- Mounted the subscribe affordance (`CalendarSubscribeMenu`) pointing at the EC1 public per-space feed
  `/spaces/<slug>/calendar.ics`.
- Times are pre-formatted server-side (via `formatEventWhen`) so the timezone lib never ships to the
  client. **Popup polish (shipped):** the popup now shows the event cover, a "N going" social-proof line
  (confirmed RSVPs), and a **"show in my timezone" toggle** that reformats the true instant in the viewer's
  own zone via native `Intl` (still no project tz lib on the client). The going count + cover come from
  `listCalendarEngagement` (a display-only enrichment keyed by the grid's event ids, kept OUT of the feed
  RPCs so the `.ics` contract is untouched). **A grid/list view toggle shipped** (the list is the
  soonest-first "what is next" scan over the whole loaded window, each row opening the same popup); a map
  toggle remains the last follow-up.

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
  removes it from every co-host calendar immediately. **The shared branch also re-gates the event's
  HOME space** (network + active, platform events with `space_id IS NULL` excepted) — the same gate the
  owned branch and the master feed enforce — so suspending or hiding the home space pulls its events off
  every co-host calendar too, and an accepted share can never out-live its home space's walling (the
  pure `filterSharedByHomeSpace` in the store mirrors the SQL shared-branch join).
  `event_space_shares` is RLS-enabled with no policies (service-role only, listed in
  `scripts/rls-deny-all.txt`); status transitions are atomic (status-guarded `WHERE`).

### EC4 — engagement polish
- **RRULE export (per-event `.ics` shipped).** A recurring ANCHOR event's own `.ics`
  (`app/events/[slug]/event.ics`) now emits ONE VEVENT carrying an `RRULE` (`rruleForRecurrence` maps the
  ADR-007 enum daily/weekly/monthly + `recurrence_until` to `FREQ=...;UNTIL=...`), so "add to calendar"
  adds the whole series instead of a single date. Masked (private/draft/cancelled) events never emit the
  cadence.
- **RRULE FEEDS shipped (ADR-807).** The SPACE feed (`app/spaces/[slug]/calendar.ics`) and the MASTER
  feed (`app/events/calendar.ics`) now collapse a recurring series to ONE `RRULE` VEVENT instead of one
  VEVENT per materialized child. `20261203000000_calendar_feed_recurrence.sql` ADDS
  `recurrence_type`/`recurrence_until`/`parent_event_id` to both feed RPCs (`space_public_calendar_feed`,
  `public_calendar_feed`) with **zero change to any WHERE clause / visibility gate** (a leak-contract
  surface). The pure `planCalendarFeed` (in `lib/events/ics.ts`) groups the flat rows: a recurring anchor
  emits the cadence + `EXDATE` for every cancelled/missing occurrence (`computeFeedExdates`), its in-feed
  children are folded in, and an ORPHAN child whose anchor left the feed (went private/cancelled/out of
  window) stays its OWN VEVENT so it is never dropped. `EXDATE` is computed in absolute (true-instant)
  space to the MATERIALIZATION HORIZON (not the last present date), so a cancelled TAIL occurrence can
  never resurrect via the RRULE. The MEMBER feed (`event_calendar_feed`) is untouched: it is per-RSVP'd
  occurrence and keeps one VEVENT per occurrence.
- Reminders for feed subscribers who have not RSVP'd (opt-in), reusing the reminder cron.
- Saved views / "add to my calendar" nudges. **"N going" social proof shipped** on the event popup (see
  EC2 popup polish above); a grid-cell count is a possible further touch.

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

## The private layer (ADR-1385)

A Space calendar is **two layers that are never merged**. The rationale and the navigation research
are in [ADR-1385](DECISIONS.md); what is done is in the backlog (`LIVE-378`), not here.

| Layer | Source | Who sees it | Becomes an event? |
|---|---|---|---|
| **Events** (public) | the events system, every gate of EC1 to EC3 unchanged | anyone the event's own visibility admits | it is one |
| **Private** | `public.space_calendar_entries`, kind `private` | the Space's team | never |
| **Unavailable** | `public.space_calendar_entries`, kind `unavailable` | the team; optionally the public, as times only | never |

**The table.** One row per entry. `kind` is declared once in `lib/calendar/registry.ts`
(`ENTRY_KINDS`) and mirrored by the table's check constraint. Time follows the events convention
(`lib/time/zone.ts`): `starts_at` / `ends_at` hold the Space's wall clock as UTC parts, read in
`time_zone`, and an all-day entry ends at 00:00 of the day after its last day. So `eventDayKey`, the
when-line formatter and the `.ics` builders work on entries unchanged. Reserved and not yet written:
`recurrence_rule` (the ADR-1299 RRULE dialect), `source_kind` + `source_id` (set together, pointing at
the record an entry came from) and `metadata`.

**Access.** RLS is the ADR-923 quad on `private.can_write_space_content(space_id)`, and the app reads
and writes through the caller's own session (`lib/calendar/entries-store.ts`,
`app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts`), so the policies are the lock. The ONLY
visitor read is `public.space_public_unavailable(space_id, from_day, to_day)`: SECURITY DEFINER,
returning `starts_at, ends_at, all_day, time_zone` for entries marked `public_unavailable` and nothing
else. Its column list is the gate; it must never gain a detail column.

**Bookings.** `readCalendarBlocks` in `lib/spaces/booking.ts` reads every non-cancelled entry with
`blocks_time` and adds its true-instant range to the booked ranges the slot builder already honours. A
slot that overlaps is neither offered nor bookable. An existing booking inside the range is never
touched. The read is service-role and fails safe to no blocks.

**Admin Calendar views** ([ADR-1389](DECISIONS.md), [ADR-1450](DECISIONS.md), [ADR-1454](DECISIONS.md), [ADR-1456](DECISIONS.md), [ADR-1457](DECISIONS.md), [ADR-1458](DECISIONS.md), [ADR-1464](DECISIONS.md), [ADR-1467](DECISIONS.md)). A viewer who
edits the Space (with the Calendar function), or platform staff previewing it, lands on **Admin**
(or the last view in the per-Space cookie) and can switch five views from one segmented control
(`CalendarModeToggle`) inside `CalendarWorkspace`. The switch slides; it does not reload the page.

| View | What it is |
|---|---|
| **Guest** | The existing public month (`guestLiveItems`). Live chips plus the C0 cancelled footer. Pencil and planning stay off. `?view=guest`. |
| **Admin** | The same sliding month as Guest (`StaffCalendar` over `loadAdminCalendar`). Drafts, pencils, private entries, unpublished and internal dates Guest does not see. Not a PM-console wrap. Stage lanes live on Projects. Default URL. |
| **List** | A condensed gathering index on the left. The right interior is the event control console: title with stage pill top-right, primary facts, share links, stats, Go to event. Not the Studio editor. `?view=list&item=`. |
| **Timeline** | The month as a linear time scale (days on the X axis, one row per gathering). Not a 7-column month grid. `?view=timeline&y=&m=`. |
| **Projects** | A kanban over `ENTRY_STAGES` (Pencil, Planning, Production, Cancelled). An event on its way moves stage through the existing entry write. No new table. `?view=projects`. |

Operators load Guest and Admin data once so a view switch does not remount. Unsigned members always get Guest and never hit `loadAdminCalendar`. Pencil, Planning, and Production lanes are `pencilLane` / `planningLane` / `productionLane` in `lib/calendar/pm-console.ts`; the component that rendered them was retired with the Admin view set (ADR-1511) and the Calendar tab Admin view is the guest-style month. Projects is the stage board.

**Loading a month.** The first month and every browsed month use the same public reader:
`loadPublicSpaceWindow` (`lib/calendar/public-month.ts`), which composes `listSpaceCalendarEvents`,
the Unavailable projection, and `guestLiveItems`. The Calendar tab Guest branch still calls
`guestLiveItems` itself so that contract stays on the page. `guestFeedState` decides the first-use
empty (kit `EmptyState`): cancelled-only and Unavailable-only feeds keep the grid and do not claim
the calendar is empty. Staff months stay on the entry actions. `lib/calendar/month-window.ts`
computes the visible grid window, including the spill days either side.

**Navigation** (`components/events/event-calendar.tsx`, `components/events/use-month-gestures.ts`).

- A sideways trackpad swipe, a sideways wheel, or a clearly horizontal touch swipe pages ONE month,
  then locks until the input has been quiet for 250ms (at most 800ms), which swallows momentum.
- A vertical wheel pages months only where the mount opts in (`vertical`): the staff calendar. A public
  calendar lives inside a scrolling page and never captures the vertical wheel.
- PageUp and PageDown step a month; with Shift, a year. ArrowLeft and ArrowRight step a month when
  the calendar itself is focused. Escape closes the month-and-year jump. A month and year panel jumps
  anywhere. Today appears when the viewer is off the current month.
- The list view groups by month. Cancelled gatherings sit under that month as the same muted footer
  the date square uses, not as list chips. A preview pane pins beside it when the calendar's CONTAINER
  is wide enough (a container query, because the same component mounts in a page, a panel and a
  column), and the popup is used otherwise.

**Adding a source.** Every calendar item (`lib/calendar/item.ts`) carries a `layer`. A new source, such
as a plan task's due date, a shift or a booking, is one row in `CALENDAR_LAYERS` plus one adapter that
maps its rows to `CalendarEvent`. The grid, the list and the preview need no change. A new kind of
private entry is one `ENTRY_KINDS` row plus one value in the check constraint.

## Pencil, Plan, Production (ADR-1386)

The lifecycle that turns an idea into a published event without retyping it. The owner rulings and the
invariants are in [ADR-1386](DECISIONS.md); each phase is a backlog row (`PROG-CAL1` to `PROG-CAL8`)
whose detail carries the full specification and whose probe says when it is done. The member-facing
words are fixed in `docs/NAMING.md`.

```
 Pencil ───────────────▶ Plan ───────────────────────▶ Production
 a tentative private     the working record: notes,    the published event, created
 date (entry kind        links, files, crm_tasks rows  through the existing event Spark
 'pencil'), candidates   with plan_id; holds many      prefilled from the plan; links
 share option_group      dates and many events         back to it; replaces the Pencil card
```

**Pencil** (`PROG-CAL1`). An entry of kind `pencil` on the private layer: tentative, team only, and not
blocking bookings unless staff say so. Candidate dates for one Pencil share `option_group`; picking one
keeps that row and removes its siblings. `hold_expires_at` is an optional lapse date the staff calendar
flags. Pencilling over an event, Unavailable time or another entry raises a clash warning and is still
allowed.

**Stages and description** ([ADR-1388](DECISIONS.md)). The staff drawer calls a kind `pencil` entry an
**Event** and gives it a **Stage**: `pencil`, `planning`, `production` or `cancelled`, declared once in
`ENTRY_STAGES` (`lib/calendar/registry.ts`) and mirrored by the table's check. The Type is editable after
creation. A trigger (`space_calendar_entries_stage_sync`) makes the database own the pairing: a pencil-kind
row always has a stage, any other kind never does, and `status` is derived from the stage (Pencil is
tentative, Planning and Production are confirmed, Cancelled is cancelled), so every reader of `status`
stays correct without knowing stages exist. The lapse date and candidate dates only exist in the Pencil
stage, dates can be added while editing, and a date that is one of several must be kept before it moves
past Pencil. **Keep this date** is one call, `public.keep_pencil_date(space, entry)`, SECURITY INVOKER so
RLS still decides. `description` (10,000 characters at most) is the public-facing copy that becomes the
event description when the entry is published (PROG-CAL3); `notes` stay internal and the form labels them
Team notes. Grid chips are styled by stage (`itemChipClass`).

**Day notes** (`PROG-CAL1`). `public.space_calendar_day_notes` holds short labels that describe a day
rather than occupy it: a `weekly` note sets `weekdays` (0 is Sunday) within optional `starts_on` /
`ends_on` bounds; a `dated` note leaves `weekdays` null and covers `starts_on` through `ends_on`. Day notes
are internal ([ADR-1387](DECISIONS.md)): only the Space's editors and platform staff read them, the
public Calendar tab never shows them, and the table's check admits only `visibility = 'team'`. Writes
are the operator quad. The grid asks `notesForDay` (`lib/calendar/day-notes.ts`) for a
day's labels. A day note never blocks time and is never a calendar item.

**Plan** (`PROG-CAL2`, shipped). `space_plans`, owned by the host Space. Calendar entries and events point at a
plan; `crm_tasks.plan_id` makes plan tasks part of the one team task inbox (`lib/crm/tasks.ts`). The
plan drawer opens from any calendar item that belongs to a plan and is composed from a Studio manifest.
A co-host Space sees a plan only through an accepted share of that plan.

**Production** (`PROG-CAL3`, shipped). "Make it a Production" opens the event Spark (`lib/studio/entities/event.ts`)
prefilled by a pure mapping from the plan and the chosen Pencil onto the manifest's field keys. The event
carries `plan_id`, and the Pencil is retired in the same step so the calendar shows one card. The
readiness bar is derived from the manifest's required fields plus the plan's open tasks. Publishing is
always the person's own press in the Spark.

**Views, playbooks, Vera, together, beyond events** (`PROG-CAL4`–`PROG-CAL8`, shipped). A board of Plans by stage
on Calendar settings; My tasks filterable by plan; to-do dates as the `todos` layer; back-to-back items stacked
on the grid; playbooks and relative dues; Vera proposals that never publish; a token-keyed private feed at
`/calendar/private/<token>`; the same Plan spine for Journey, Program, and maintenance targets.

Voice: all calendar copy follows `docs/CONTENT-VOICE.md` (no em/en dashes) + `docs/NAMING.md`.
