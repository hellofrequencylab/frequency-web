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
touched. The read is service-role and fails safe to no blocks. A repeating entry contributes every
landing inside the horizon, minus its `exception_dates` (`PROG-CAL13`, below).

**Admin Calendar views** ([ADR-1389](DECISIONS.md), [ADR-1450](DECISIONS.md), [ADR-1454](DECISIONS.md), [ADR-1456](DECISIONS.md), [ADR-1457](DECISIONS.md), [ADR-1458](DECISIONS.md), [ADR-1464](DECISIONS.md), [ADR-1467](DECISIONS.md)). A viewer who
edits the Space (with the Calendar function), or platform staff previewing it, lands on **Admin**
(or the last view in the per-Space cookie) and can switch between four views inside `CalendarWorkspace`:
a **Guest preview** button beside a three-way toggle (Calendar, List, Workflow) in `CalendarModeToggle`.
Both are hand-rolled buttons until HYG-105 lands a kit segmented control; the switch slides and does
not reload the page.

| View | What it is |
|---|---|
| **Guest** | The existing public month (`guestLiveItems`). Live chips plus the C0 cancelled footer. Pencil and planning stay off. `?view=guest`. |
| **Admin** (labelled **Calendar**) | The team's month (`StaffCalendar` over `loadAdminCalendar`). Drafts, Pencils, Private entries, unpublished and internal dates Guest does not see. Guest and Admin start on the same month and then each keeps its own position: they are two `EventCalendar` mounts, not one shared month. The stage board is Workflow. Default URL. |
| **List** | A condensed gathering index on the left. The right interior is the event control console: title with stage pill top-right, primary facts, share links, stats, Go to event. Not the Studio editor. `?view=list&item=`. |
| **Workflow** | Every Plan, grouped by its production stage (`workflowBoard` over `PLAN_STAGE_TRANSITIONS`). A Plan moves stage through `transitionPlanStage`; "Open Plan" opens the same drawer Calendar and List open. `?view=workflow`. |

Operators load Guest and Admin data once so a view switch does not remount. Unsigned members always get Guest and never hit `loadAdminCalendar`. The Pencil, Planning and Production lane helpers live in `lib/calendar/pm-console.ts`, which the List index reads; the Calendar tab Admin view (labelled Calendar) is the team's month in the same grid chrome as Guest.

**The Calendar console** (PROG-CAL12, owner ask 2026-09-22; `components/spaces/calendar-console.tsx`). The full-screen edit mode of the Space calendar. It is the same `CalendarWorkspace` panel set and the same Plan drawer, shown inside a full-screen OVERLAY (`Dialog` `align="overlay"`) rather than inline on the page: a panel on the dimmed page, with a thin margin of that dimmed page showing all the way around (a hairline inset on a phone, ~2.5vmin from `sm` up, both floored by the safe area), taking the surface token, the card radius and a real elevation. Inside it: the shown month and the viewer's time zone as the title, Prev / Today / Next grouped in one bordered cluster, then Guest preview, the view toggle, Pencil it in and the shortcuts sheet, with Close last behind its own divider; the month's agenda down the left, grouped by day under sticky headings, separated from the stage by one hairline divider, each row selecting the item the List view selects and carrying Open Plan; Ask Vera collapsed above the panels. Month, view, List selection and the open Plan live in the workspace, so all of it travels in and out unchanged. **The panel set travels as a live DOM move, never as a second render**: the workspace keeps it at one position in the React tree and portals it into a host div that a layout effect parks either in the page slot or in the console's `[data-calendar-console-stage]`. That is the fix for the blink the owner reported on 2026-09-22: the two homes used to be two positions in the tree, so every open and every close unmounted both grids, the Vera box and any entry form that was open, and rebuilt them. It opens only from the "Fullscreen" control beside the view toggle or the F key (never a scroll, hover, double click, resize, rotation or remembered preference; the control's own title says so, which is why the first-visit hint row retired), and it exits on Esc (the drawer first when it is up, then the console), the Close control, or the browser's Back button: opening pushes a history entry carrying `?console=1` beside `view`, `item` and `plan` (`adminViewHref`, `parseConsoleFlag`), so a pasted link reopens it on the same month, view and drawer. On the page the staff grid pages by its buttons only (the month picker, Prev / Today / Next): no wheel, no swipe. Inside the console the vertical wheel and a sideways swipe page months too, and Left / Right, T, N and ? are the console's keys. It is a takeover layout, not the Fullscreen API: `lib/fullscreen.ts` records the owner's decision (2026-06-22) that `Element.requestFullscreen` is never called.

**On a phone, and on a keyboard** (LIVE-469). Three rules the calendar surfaces keep. A cell at 360px is about 46px wide, so a chip prints its title and the time goes `sr-only` until `sm`, where both fit; the per-day `+` steps aside below `sm` because a 44px target plus the day pill does not fit that cell, and "Pencil it in" above the grid is the phone's door. `--tap-min` rises to 44px under `@media (pointer: coarse)` (`app/globals.css`, "The touch floor"), which is the rule the IconButton, Checkbox and Select comments had been promising and nothing had ever set; with a mouse the floor is unchanged. Focus never drops to the body: Today stays mounted and goes disabled on the current month rather than vanishing under the focus that pressed it, a month picked in the jump panel and Escape on that panel both land on the month title, a Workflow stage change lands back on the card that moved, Vera's Accept hands focus to the result lines, and on a stacked phone layout the List console takes focus and scrolls itself in so a tap is never silent. What changes is announced: `Loading` and Vera's `Working` sit in live regions that are mounted before they have anything to say, the result lines are `aria-live`, each grid popup is named by its own entry title rather than "Details", and a month whose fetch failed says so above the grid with a Try again, because a failed fetch drawn as an empty month is the one thing this component promises never to show. The four view panels sit in one flex row with `items-start`, and a panel that is not showing is `h-0 overflow-hidden`, so a long List index no longer leaves the Calendar scrolling into blank space.

**Retired views (HYG-118, 2026-09-22).** Timeline (a linear month scale) and Projects (a kanban over `ENTRY_STAGES`) shipped as files that no route ever mounted; ADR-1503 had already called one of them orphaned. Both were deleted with their server action (`moveCalendarProjectStage`) and helpers. Their URL values are still accepted: `?view=timeline` resolves to Admin and `?view=projects` to Workflow, in the query and in the remembered-view cookie (`parseAdminCalendarView`, `parseRememberedCalendarView`), so an old bookmark lands somewhere real.

**Loading a month.** The first month and every browsed month use the same public reader:
`loadPublicSpaceWindow` (`lib/calendar/public-month.ts`), which composes `listSpaceCalendarEvents`,
the Unavailable projection, and `guestLiveItems`. That reader is the one place the guest gate runs;
the Calendar tab Guest branch calls the reader and does not fold through `guestLiveItems` a second
time (LIVE-468). `guestFeedState` counts the feed it gets back (live, cancelled, Unavailable) and
declares first-use only when all three are zero, so a cancelled-only or Unavailable-only feed keeps
the grid; the kit `EmptyState` under the grid reads `isFirstUse`. Staff months stay on the entry
actions. `lib/calendar/month-window.ts` computes the visible grid window, including the spill days
either side.

**Navigation** (`components/events/event-calendar.tsx`, `components/events/use-month-gestures.ts`).

- A sideways trackpad swipe, a sideways wheel, or a clearly horizontal touch swipe pages ONE month,
  then locks until the input has been quiet for 250ms (at most 800ms), which swallows momentum. The
  Space page's staff grid turns this off (`horizontal: false`): on the page it pages by its buttons only.
- A vertical wheel pages months only where the mount opts in (`vertical`): the staff calendar inside
  the Calendar console. A public calendar lives inside a scrolling page and never captures the vertical
  wheel, and neither does the staff grid on the page.
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

## Pencil, Planning, Production (ADR-1386, ADR-1523)

The lifecycle that turns an idea into a published event without retyping it. The owner rulings and the
invariants are in [ADR-1386](DECISIONS.md); each phase is a backlog row (`PROG-CAL1` to `PROG-CAL8`)
whose detail carries the full specification and whose probe says when it is done. The member-facing
words are fixed in `docs/NAMING.md`: the STAGES are Pencil, Planning, Production ([ADR-1523](DECISIONS.md)
struck the "Pencil, Plan, Production" clause), and capital-P **Plan** is the OBJECT, the working record
a date carries through every stage.

```
 Pencil ───────────────▶ Planning ───────────────────▶ Production
 a tentative private     the date is decided and the   the published event, created
 date (entry kind        team is putting it together   through the existing event Spark
 'pencil'), candidates   in its Plan (space_plans:      prefilled from the Plan; links
 share option_group      notes, links, to-dos, people)  back to it; replaces the Pencil card
```

**Pencil** (`PROG-CAL1`). An entry of kind `pencil` on the private layer: tentative, team only, and not
blocking bookings unless staff say so. Candidate dates for one Pencil share `option_group`; picking one
keeps that row and removes its siblings. `hold_expires_at` is an optional lapse date the staff calendar
flags. Penciling over an event, Unavailable time or another entry raises a clash warning and is still
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

**Repeating Pencils with explicit exceptions** (`PROG-CAL5`). A Pencil may repeat: the drawer's Repeats
control (Does not repeat, Every week, Every 2 weeks, Every month) writes `recurrence_rule` in the same
bounded RFC 5545 dialect as `events.recurrence_rule` ([ADR-1299](DECISIONS.md)), and
`lib/calendar/pencil-series.ts` expands it with the events engine's own `parseRepeat` and `expandRepeat`
(one grammar, one stepping; a rule outside the subset is treated as absent). A series is one row anchored
on its first date; the month read fetches every rule-carrying row that starts before the window and
`entryItemsInWindow` draws one chip per landing, each carrying the master's id and its own
`occurrenceDate`, so Edit opens the series. A deliberate skip is EXPLICIT: "Skip this date" on an
occurrence appends that day to `exception_dates` (`date[]`, migration `20270345008000`) through
`skipPencilDate`, the generator drops every listed day and never re-bases the cadence around the gap, and
the only way a date comes back is "Put it back" in the drawer, which removes it from the list. Nothing
infers a skip from a gap. Pencils are never public, so the guest layer and the Unavailable projection are
untouched. A repeating entry is one series everywhere else too (`PROG-CAL13`): `readCalendarBlocks` in
`lib/spaces/booking.ts` fetches every rule-carrying blocking row that starts before its horizon (the
365-day ceiling of `bookingWindowDays`) and expands it through `expandPencilSeries`, so every landing
blocks a slot and a skipped date does not; and the private `.ics` feed emits a repeating entry as ONE
VEVENT (`lib/calendar/entry-feed.ts`): the anchor in the TZID local form, its `RRULE` through
`rruleForRepeat` (the emitter events already export with), and one `EXDATE` per skipped day at the
master's wall clock in the entry's zone, so a subscriber's calendar draws the series itself and keeps
the gap.

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
Its footer's "Archive Plan" (`archiveSpacePlan`, HYG-120) sets `space_plans.archived_at`, deletes the
Plan's penciled dates that never became an event, and unlinks the ones that did; reversible in SQL,
not yet in the UI. The e2e suite tears its own Plans down through that same door.
A co-host Space sees a plan only through an accepted share of that plan.

**Production** (`PROG-CAL3`, shipped). "Make it a Production" opens the event Spark (`lib/studio/entities/event.ts`)
prefilled by a pure mapping from the plan and the chosen Pencil onto the manifest's field keys. The event
carries `plan_id`, and the Pencil is retired in the same step so the calendar shows one card. The
readiness bar is derived from the manifest's required fields plus the plan's open tasks. Publishing is
always the person's own press in the Spark.

**Views, playbooks, Vera, together, beyond events** (`PROG-CAL4`–`PROG-CAL8`, shipped). A board of Plans by stage
on Calendar settings; My tasks filterable by plan; to-do dates as the `todos` layer; a day with several items
drawn as one stacked block on the grid (`stackDay` in `lib/calendar/sunday-stack.ts` groups by day; `areBackToBack`
is the abutting test); playbooks and relative dues; Vera proposals that never publish; a token-keyed private feed at
`/calendar/private/<token>`; the same Plan spine for Journey, Program, and maintenance targets.

**What Vera actually reads** (`PROG-CAL6`, closed 2026-09-22). `lib/calendar/vera-plan.ts` is pure and only as
honest as what `veraPlanProposal` (`app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts`) hands it.
Dates: the busy set is this Space's calendar for the 90 days after the day suggestions start from (the Plan's
anchor day while it is still ahead, else today): private entries and day notes on the caller's session, and the
Space's own events, drafts included, through `listSpaceEventSpans` in `lib/calendar/admin-calendar.ts`. The
mapping from rows to day keys is `busyDayKeysFor` in `lib/calendar/availability.ts`, read off each row's stored
wall clock like the month grid, so a suggestion never lands on a Pencil, an Unavailable span, an event or a noted
day. Recap: for a Plan in production the attendance is the record of the events the Plan became (both
`events.plan_id` and `published_event_id`), counted by `attendanceCount` in `lib/events/attendance.ts` from host
marks and verified self check-ins, one person once; null only when that record is empty. The recap says nothing
about running late because nothing in the data records when an event ended. Voice: every string Vera emits goes
through `voiceLine` in `lib/ai/voice.ts`, the mechanical half of the primer, with no model call. Vera still never
publishes, sends or books; the proposal is shown and the team accepts it.

**Vera on the calendar** (`PROG-CAL10`, shipped 2026-09-22). An "Ask Vera" row sits above the operator
panels for the team that can edit the calendar (`components/spaces/vera-calendar-box.tsx`). A person picks
the mode new things start in (Pencil, Planning or Production), types the ask in plain words ("Pencil a
sound bath on every new moon this winter"), and Vera answers with a PROPOSAL: one line per change, from a
closed vocabulary (`lib/calendar/vera-command.ts`: pencil one Plan on many dates, move a date, set a
stage, retitle, add a to-do, archive), each line with a box. Propose then accept is the invariant
(ADR-1386 P6): `veraCalendarCommand` reads this Space's Plans and the visible month's dates and returns
the proposal without writing anything; only `applyVeraChanges`, on the ticked lines, re-parses the list
through `parseVeraChanges` and drives each change through the existing calendar actions and stores on
the caller's session, reporting one result per line. Nothing in the vocabulary publishes. "Every new
moon" is computed, never guessed: `lib/calendar/moon.ts` (Meeus ch. 49) answers a `lunar_dates` tool the
model must call first, in the Space's zone (`lib/ai/vera-calendar.ts`, Sonnet, at most three rounds,
budget and rate limited under `vera-calendar`). Not in the first cut: a follow-up question from Vera,
editing arbitrary Plan fields, undo, and reading attendance to pick dates.

**Production seams for the non-event targets** (`PROG-CAL8`, `PROG-CAL9`, shipped). Each target in `PLAN_TARGET_DEFS`
(`lib/calendar/plans.ts`) declares the door "Make it a Production" opens, sending the identifier its destination
resolves (a slug for `/journeys/new` and `/spaces/<slug>/settings/program`, an id for `/events/new`) plus `plan=`.
The destination authorizes the Plan through `getSpacePlan` against the Space it is creating for, writes the
back-link on the insert (`journey_plans.space_plan_id`, `topical_channels.space_plan_id`; named for the table they
point at, since `plan_id` already means the Journey on its children and would be misread beside a Channel's
`template_id`), then advances the Plan best-effort with one `calendar.production_plan_stage_not_advanced` log line
per failure (`closeProductionSeam`, `closeJourneyProductionSeam`, `closeProgramProductionSeam`). A `plan=` the
Space does not run is reported on the page, never dropped. Maintenance declares no door on purpose.

Voice: all calendar copy follows `docs/CONTENT-VOICE.md` (no em/en dashes) + `docs/NAMING.md`.
