# Events — Design Spec for the two surfaces (`/events` + `/events/[slug]`)

> **The answer up front.** This is the interior design for the two Events
> surfaces named in [`EVENTS-REWORK.md`](EVENTS-REWORK.md): **The Catalog**
> (`/events`, an Index of discoverable events) and **The Invite**
> (`/events/[slug]`, a Detail page split into a wide left **Post area** and a
> narrow sticky right **Join area**). Both **compose the existing kit**: no new
> templates, no hand-rolled headers/cards/grids, DAWN tokens only.
>
> **The one chrome change** (the load-bearing decision): set
> `/events/[slug]` to rail **`'none'`** so the page interior owns BOTH columns,
> like Luma/Partiful. The exact one-line edit to `lib/layout/page-chrome.ts` is in
> §1. Everything else reuses what is already built. **Only the page interior
> changes. The app shell, top nav, and global navigation are untouched.**

**Scope of this doc:** layout (sections → slots), component inventory mapped to the
kit, gamification/badge treatment, every state, responsive rules, the chrome call,
and a reference JSX skeleton per page. It is a *design* deliverable: no code in
`app/`, `components/`, or `supabase/` is edited.

**Status legend:** ✅ reuse as-is · ⏳ reuse with a small prop/slot add · ⚠️ small
**new** component (genuinely missing) · 🔴 do not build (anti-pattern to avoid).

---

## 1. The chrome / rail decision (resolve first, it shapes everything)

| Route | Today | Recommend | Why |
|---|---|---|---|
| `/events` (Catalog) | `global` rail | **keep `global`** ✅ | An Index/browse page. The community rail (`['events','online','circles']` from `rail-panels.ts`) is *additive context*, not a competing column. Discovery cards live in the main column; the rail stays. |
| `/events/[slug]` (Invite) | `global` rail | **change to `'none'`** ⚠️ | The interior needs a real two-column split (wide Post area + narrow sticky Join area). A global right rail on top of an interior right Join column is the **double-rail trap** the framework warns against (PAGE-FRAMEWORK §8.2). Luma/Partiful/Eventbrite all give the detail page its own full-width canvas with an in-content sticky aside. `'none'` lets the interior own both columns. |

### The exact edit (one line, in `lib/layout/page-chrome.ts`)

The detail page is a *read/decide* surface, not a Focus form, so it does not belong
in `FOCUS_PREFIXES`. Add a precise pattern to `FOCUS_PATTERNS` that matches the
detail slug **without** swallowing the index, `/events/new`, `/events/drafts`,
`/events/scan` (already matched above it), or `/events/[slug]/event.ics`.

```ts
// lib/layout/page-chrome.ts — inside FOCUS_PATTERNS, AFTER the existing
// /events/new, /events/scan, /events/drafts rules (longest/most-specific first):
//   /^\/events\/[^/]+$/  → the event Invite page owns its own two-column interior
//                          (wide Post area + sticky Join aside); the global rail is
//                          suppressed to avoid the double-rail trap. NOT a Focus form
//                          — it's a Detail page that simply needs the full width.
/^\/events\/(?!new$|scan$|drafts(\/|$))[^/]+$/,
```

Notes on the regex: `[^/]+` keeps it to a single segment (the slug), so
`/events/[slug]/event.ics` and any future `/events/[slug]/manage` are **not**
matched and keep their own treatment. The negative lookahead re-excludes the
sibling Focus routes belt-and-suspenders even though their own rules sit earlier.
Lock it with a case in `page-chrome.test.ts` (assert `railFor('/events/some-slug')
=== 'none'` and `railFor('/events') === 'global'`).

> **Why not `'scoped'`?** `'scoped'` means "the Detail page renders its own *scope
> rail* in-body" (the circle/channel pattern). The Invite's right column is not a
> scope rail of stat widgets. It is the primary **Join** action surface. `'none'`
> is the honest setting: the page draws its own grid. `DetailTemplate`'s own header
> comment already notes the scoped rail comes from the shell slot, not the
> template, so suppressing it is correct here.

> **`DashboardTemplate` for the host Manage screen** (`/admin/events/[id]`, Track A2)
> is out of scope for this doc but noted: it is `'none'` already (under `/admin/*`)
> and uses `StatCard`/`StatStrip`. This spec covers the member-facing Invite + Catalog.

---

## 2. THE INVITE — `/events/[slug]` (Detail)

Reference set: Partiful (expressive page, guest list, Boops, photo album, co-hosts,
capacity + auto-waitlist), Luma (minimal beautiful page, registration questions,
theme, calendar at RSVP), Eventbrite (sticky "Get tickets" aside, schema.org Event).

### 2.1 Annotated layout (sections to slots)

```
┌─ INTERIOR (full width; app shell + nav unchanged) ───────────────────────────┐
│                                                                              │
│  [A] TOP BAND  (full interior width)                                         │
│   A1  Hero / cover image            → DetailTemplate `hero` slot             │
│   A2  Title + when · where · host · attendance mode  → DetailTemplate        │
│         `title` + `subtitle` (mode chip → `badges`)                          │
│   A3  Gamification + badges row     → ⚠️ EventRewardStrip (new, small)       │
│         Zaps-for-attending · check-in reward · attendance/host streak ·      │
│         Circle Current contribution · warm proof · host/cohost · posted-by   │
│                                                                              │
│  ── below the band, a TWO-COLUMN grid (lg:grid-cols-[minmax(0,1fr)_360px]) ──│
│                                                                              │
│  ┌──────────────── [B] POST AREA (wide, left) ──┐  ┌─ [C] JOIN AREA ───────┐ │
│  │  B1  Description / poster details             │  │  (narrow, sticky)      │ │
│  │  B2  Event Dispatches (host updates,          │  │  C1  RSVP controls     │ │
│  │       event-badged)  → EventActivity (host    │  │       Going/Maybe/Can't│ │
│  │       posts render with a Dispatch badge)     │  │       +1s · waitlist · │ │
│  │  B3  Guest comments + Boops + GIFs            │  │       request-to-join  │ │
│  │       → EventActivity (⏳ add reactions/GIF)   │  │  C2  Ticket / PWYC     │ │
│  │  B4  Recap album (after the event)            │  │       → TicketButton   │ │
│  │       → RecapAlbum                            │  │  C3  Add to calendar   │ │
│  │                                               │  │       (at RSVP moment) │ │
│  │                                               │  │  C4  Critical info:    │ │
│  │                                               │  │       date/time,       │ │
│  │                                               │  │       location + map,  │ │
│  │                                               │  │       capacity/spots,  │ │
│  │                                               │  │       guest list       │ │
│  └───────────────────────────────────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

The two-column split is a **plain CSS grid inside `DetailTemplate`'s `children`**,
not a new template. `DetailTemplate` already exposes `hero`, `title`, `subtitle`,
`badges`, `actions`; the band (A) fills those, and the grid (B+C) is the body.

### 2.2 Component inventory: Invite

| Slot | Component | Status | Note |
|---|---|---|---|
| A1 cover | `DetailTemplate` `hero` slot + `next/image` | ⏳ | Slot exists; today it's unused. Pass a 16:9 `<Image fill>` cover (or a token placeholder `bg-surface-elevated` when none). The detail page currently sets no hero. This is the one-line win that delivers the Partiful/Luma "beautiful page." |
| A2 title/meta | `DetailTemplate` `title` + `subtitle` | ✅ | Already renders title + when/where/host/scope/posted-by. **Attendance mode** (in-person / online / hybrid) becomes a `badges` chip (see §2.4). |
| A3 rewards | **`EventRewardStrip`** | ⚠️ new | Small presentational row. Composes existing pieces (see §2.3). Lives between the band and the two-column grid. |
| B1 description | inline prose + `PosterDetails` | ✅ | Keep open prose (not boxed), `max-w-2xl` reading column. |
| B2 dispatches | `EventActivity` | ⏳ | Host posts already flow here; **add an event Dispatch badge** to host-authored items (ADR-255) so they read as "a Dispatch with an event badge." A small `isDispatch`/`badge` prop on each post. |
| B3 comments + Boops + GIF | `EventActivity` | ⏳ | Comments + image attach exist. **Add: Boops** (the reaction set, a small reaction bar per post) **and a GIF picker** beside the image button. Both are leaf interactions inside the existing client component. |
| B4 recap | `RecapAlbum` | ✅ | Renders post-event; no change. |
| C1 RSVP | `RsvpControls` + `CrewGateButton` | ✅ | Three states (Going / Interested / waitlist) + plus-ones stepper, all built. **Add: optional +1 names** and **"Request to join"** for approval-required events (Track A1) as extra `RsvpControls` props. |
| C2 ticket | `TicketButton` / `RefundTicketButton` | ✅ | PWYC/tiers/free-claim already handled. Moves from inline body into the Join aside. |
| C3 calendar | `AddToCalendar` | ✅ | Surface `emphasis` right after a "going" RSVP (highest-ROI lever). |
| C4 critical info | **`EventFactPanel`** | ⚠️ new (thin) | A small aside card grouping date/time · location + a mini `EventsMap` · capacity/spots · guest-list summary. Pure composition of existing bits + `WarmProof`; see §2.5. |
| status banners | inline token cards | ✅ | Cancelled / claimed / ticket-confirmed banners already exist. |
| attendees | guest list in C4 | ✅ | Reuse the existing avatar+name list (Crew see names; others see a count, privacy-by-default). |
| cohosts | `CohostManager` | ✅ | Stays in the band/host area or top of Post area. |

**New components total: two (`EventRewardStrip`, `EventFactPanel`) plus prop adds.**
Both are thin, presentational, server-friendly compositions of things already in the
repo. They exist so the band and aside read uniformly, not because a primitive is
missing.

🔴 **Do not** hand-roll a second `<h1>`, a bespoke card chrome, a new RSVP button
shape, or a `text-[14px]` anywhere. 🔴 Do not add a `success`/green chrome accent for
"going" beyond the existing `success` status tokens already in `RsvpControls`.

### 2.3 Gamification + badges row (A3): `EventRewardStrip`

The row's job: make the rewards and the social proof legible **without** turning the
event into a leaderboard. It honours the **gamified-stat law** — the four KPI tiles
(Zaps/Rank/Streak/Gems) are reserved for *member standing* via `StandingTiles`, so an
event must **never** render those as KPI tiles. Event rewards are shown as **calm
inline chips**, in the established gamification idiom (icon + token tint), not stat
cards.

Visual treatment (all DAWN tokens, lucide icons, matches `standing-tiles.tsx`):

| Chip | Icon | Token treatment | Copy (voice-checked) |
|---|---|---|---|
| Zaps for attending | `Zap` `text-primary` | `bg-primary-bg/40 rounded-full px-2.5 py-1 text-2xs font-semibold text-text` | `+12 Zaps when you check in` |
| Check-in reward | `QrCode` `text-primary-strong` | same chip | `Check in at the door` (post-event: `Check in to earn`) |
| Attendance / host streak | `Flame` `text-primary-strong` (or `text-subtle` at 0) | same chip | `Keeps your 6-week streak` |
| Circle Current contribution | `Activity` `text-signal` | `bg-signal-bg rounded-full … text-signal-strong` | `Adds to {Circle}'s Current` |
| Warm proof ("who's going") | avatar pile | `WarmProof` ✅ (never-low counts) | `8 going · 2 from your circles` |
| Host / cohost credit | avatar + `Crown` | inline, links to profile | `Hosted by {name}` |
| Posted-by credit | `Zap` `text-primary` | inline | `Posted by {name}` |

Rules baked in (CONTENT-VOICE + EVENTS-REWORK Law 1):
- Numbers are real or the chip is absent. No "0 going," no countdowns, no fake
  urgency. `WarmProof` already enforces the never-low floor — reuse it, don't
  reinvent.
- Streak chip says what it *protects* ("keeps your 6-week streak"), never narrates a
  feeling, and never threatens loss ("don't break your streak" is banned).
- The whole strip collapses gracefully: each chip renders only when its value is
  genuine, so a brand-new event shows just "Be the first to RSVP" + the Zap chip.
- The signal-teal `Circle Current` chip is the one place teal appears; it is the
  canonical Circle Current tone, not decoration.

Layout: `flex flex-wrap items-center gap-2` on a hairline-bottomed row
(`border-b border-border pb-4`). On mobile it wraps to 2–3 lines; no horizontal
scroll.

### 2.4 Attendance mode chip (A2 `badges`)

A single chip in `DetailTemplate`'s `badges` slot, reading from `attendance_mode`
(Track B1: `in_person` / `online` / `hybrid`):

| Mode | Icon | Token | Label |
|---|---|---|---|
| In person | `MapPin` | `bg-surface-elevated text-muted` | `In person` |
| Online | `Video` | `bg-broadcast-bg text-broadcast-strong` | `Online` |
| Hybrid | `Globe` | `bg-primary-bg text-primary-strong` | `In person + online` |

Online events get a "Join link" affordance in the Join aside instead of a map.

### 2.5 The Join aside (C) — `EventFactPanel` + the critical-info group

The aside is the conversion column. Order, top to bottom (this is the Eventbrite/Luma
priority):

1. **Primary action** — `RsvpControls` (or `TicketButton` for paid). One loud
   `bg-primary` button; everything else is quiet.
2. **At-RSVP calendar** — `AddToCalendar emphasis` appears the instant status is
   `going` (implementation-intentions lever).
3. **Critical info card** (`EventFactPanel`, a single `rounded-2xl border border-border
   bg-surface p-4` card):
   - Date/time (`CalendarDays`), location line (`MapPin`) — online → join link.
   - **Mini map**: reuse `EventsMap` at a fixed small height when the event has
     coordinates; city-level pin (the existing privacy note applies).
   - Capacity / spots: `WarmProof`'s `nearFull` + `spotsLeft` only ("Filling up. 3
     spots left") — never a bare low count.
   - Guest list summary: avatar pile + "8 going" → expands to names for Crew
     (privacy-by-default: non-Crew see the count, not the roster).

The aside is **sticky on scroll** (`lg:sticky lg:top-20 self-start`) on `lg+`, the
Partiful/Luma/Eventbrite convention, so the RSVP never scrolls out of reach while the
guest reads the Post area.

### 2.6 Responsive behaviour (Invite)

**Decision: on mobile the Join column collapses to a sticky bottom action bar, and
the full critical-info card stacks ABOVE the Post area.** Justification:

- The single most important mobile action is "RSVP / Get ticket." A **sticky bottom
  bar** (`fixed inset-x-0 bottom-0`) keeps it one thumb-tap away through the whole
  scroll — the dominant mobile commerce/event pattern (GoodUI #41; Eventbrite,
  Luma). It carries the price/status + the primary button only; tapping opens the
  full RSVP/ticket sheet (`Dialog`).
- The rest of the critical info (date, map, spots, guest list) **stacks above** the
  Post area so a guest sees the facts before the conversation — better than burying
  them under a long comment thread.
- The sticky bar must not occlude the composer: the Post area gets
  `pb-24` on mobile so the last comment clears the bar. The bar hides itself for the
  host (no self-RSVP) and for past/cancelled events (shows status text instead).

Breakpoints:

| Width | Layout |
|---|---|
| `< lg` (mobile/tablet) | Single column: band → critical-info card → Post area (`pb-24`). Sticky bottom action bar with primary RSVP/ticket → opens a `Dialog`. |
| `≥ lg` | Two-column grid `lg:grid-cols-[minmax(0,1fr)_360px] gap-8`. Right column `lg:sticky lg:top-20`. No bottom bar. |

### 2.7 Every state (Invite)

| State | Treatment | Component |
|---|---|---|
| **Loading** | Per-section `<Suspense>` (PAGE-FRAMEWORK §5): band paints immediately; the **activity feed**, **recap**, **guest list**, **connector/ticket** reads each stream behind their own boundary with a dimension-matched skeleton. Never block the shell awaiting RSVPs or AI blurbs. | `Suspense` + `Skeleton` |
| **Empty (no RSVPs)** | `WarmProof` shows "Be the first to RSVP" (never "0 going"); activity shows "Quiet so far. Be the first to say hi." | `WarmProof` ✅ / `EventActivity` ✅ |
| **Full → waitlist** | `RsvpControls` "Going" segment becomes "Join waitlist"; `WarmProof` shows "Filling up. N spots left" only when genuinely near-full. Auto-promote on cancellation (Partiful/Luma behaviour). | `RsvpControls` ✅ / capacity logic ✅ |
| **Past → recap** | RSVP swaps to **Check in** (while same-day) then read-only; `RecapAlbum` appears; activity placeholder flips to "Say thanks, share a moment." | `RecapAlbum` ✅ / `EventActivity` ✅ |
| **Cancelled** | `bg-danger-bg border border-danger` banner at top: "This event has been cancelled." RSVP/ticket actions hidden; comments read-only. | inline ✅ |
| **Sold out** | Ticket block shows "Sold out."; free events with capacity → waitlist line. No countdown. | `TicketButton` block ✅ |
| **Private / unlisted** | Visibility gate already `notFound()`s a private slug for non-managers (no existence leak); unlisted is link-only and renders normally with a small `Lock`+"Unlisted" chip in `badges` so the host knows it's not in the Catalog. | gate ✅ + ⏳ chip |
| **Approval required** (A1) | Primary button reads **"Request to join"**; pending shows a calm "Request sent. The host will confirm." Invited guests skip the queue (Luma rule). | ⏳ `RsvpControls` prop |
| **Error** | Section-level `EmptyState variant="error"` inside the failing Suspense boundary, never a blank pane. | `EmptyState` ✅ |

---

## 3. THE CATALOG — `/events` (Index)

Reference set: Eventbrite/Meetup (filters by topic/format/date/location, grid,
SEO), Luma Discover ("near you," personalized lanes), Meetup (Topic × Format
taxonomy).

### 3.1 Annotated layout

```
┌─ INTERIOR (Index template; global rail kept) ────────────────────────────────┐
│  PageHeading: title · description · actions(My drafts · Subscribe · New event)│
│  Toolbar (sticky-ish): Search · Category · Format · Date · Price · Distance · │
│            Has-spots   +   Sort menu   +   List ⇄ Map toggle                  │
│  ── body ───────────────────────────────────────────────────────────────────│
│  [For You lane]   (streamed, cold-start-safe — renders nothing without signal)│
│  [Connector suggestions]  (streamed; null unless a real suggestion)           │
│  [You're going]   (when any)                                                  │
│  [Upcoming / results grid]  EventCard grid  ⇄  EventsMap                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component inventory — Catalog

| Slot | Component | Status | Note |
|---|---|---|---|
| Header | `IndexTemplate` + `PageHeading` | ✅ | Title/description/actions already wired. |
| Filters | `FacetDropdown` ×N | ✅ | URL-driven, shareable. Today: Category, Energy, Spots, Distance. **Add: Format** (in-person/online/hybrid from `attendance_mode`) and **Date range** (Today/This week/This weekend/This month) and **Price** (Free/Paid). All are `FacetDropdown` instances — zero new primitives. |
| Search | **`DirectorySearch`** | ⏳ | A search input already exists for directories (`components/ui/directory-search.tsx`); reuse it as a URL-driven `q` param. Backed by FTS + `pg_trgm` + embeddings (EVENTS-REWORK B2). |
| Sort | `FacetDropdown` (single-select) | ⏳ | Options: Date (default) · Distance (when home set) · Popularity · Relevance (when `q` present). One more `FacetDropdown` labelled "Sort." |
| List ⇄ Map | `EventsMapToggle` | ✅ | Built; lazy-mounts maplibre, hides when nothing mappable. |
| Cards | `EventCard` (wraps `EntityCard`) | ✅ | The page's local `EventCard` already composes `EntityCard` with date block, warm badge, going count, host. **Add `cover` for events with a cover image** (EntityCard supports a `cover` 16:9 slot) so the Catalog reads like Luma Discover. |
| For You lane | `ForYouLane` (local, streamed) | ✅ | Cold-start-safe: renders only with a usable interest/social signal. Keep behind `<Suspense>`. |
| Connectors | `EventConnectors` | ✅ | Streamed; null unless a real suggestion. |
| Section labels | `SectionHeader` | ✅ | "For you," "You're going," "Upcoming." |
| Empty / no-results | `EmptyState` | ✅ | Variant-aware (see §3.4). |
| Per-card RSVP | `RsvpButton` | ✅ | One-tap, floats on the card. |

**New components total: zero.** The Catalog is fully expressible from the kit; the
work is adding Format/Date/Price facets (more `FacetDropdown`s), a Sort dropdown, a
search param, and the `cover` image on the card.

### 3.3 Hybrid scope (ADR-254) — standalone public events in the Catalog

The current listing is **circle-anchored** (it queries `events` by the viewer's
`scope_id IN myCircleIds`). For the hybrid scope, the Catalog must also surface
**standalone public events** (`visibility='public'`, `scope_type != 'circle'`):

- Query union: in-scope circle events (as today) **+** public events near the
  viewer's fuzzed home geocell (Track B1 `nearby_events` RPC).
- The cold-start empty state changes: a member in **no** circles today sees "join a
  circle." Under hybrid scope they instead see **public events near them** first, and
  the "join a circle" card becomes a secondary nudge — the Catalog is no longer empty
  for the circle-less.
- Card provenance: circle events keep the `{Circle}` pill; standalone public events
  show a `Public` chip (`bg-surface-elevated text-muted`) and the organizer name.
- Listing hygiene: only `public` + `circle_only` are listed (unlisted/private never
  appear) — the existing `.in('visibility', [...])` guard already enforces this.

### 3.4 Every state (Catalog)

| State | Treatment | Component |
|---|---|---|
| **Loading** | Shell + header + facets paint immediately; the **For You lane** and **connector** reads stream behind `<Suspense>` with skeletons. The main grid is a fast query and renders with the shell. | `Suspense` + `Skeleton` ✅ |
| **Empty (no events at all)** | `EmptyState variant="first-use"`: under hybrid scope, "Nothing near you yet" + "Find a circle." Honest, never fabricated. | `EmptyState` ✅ |
| **No-results (filters too tight)** | `EmptyState variant="no-results"` + a "Clear filters" link back to `/events`. | `EmptyState` ✅ |
| **Map empty** | `EventsMapToggle` hides the toggle when no event is mappable; list carries the page. | ✅ |
| **For You has no signal** | Lane renders nothing (cold-start rule) — soonest-first carries the page. | `ForYouLane` ✅ |

### 3.5 Responsive grid (Catalog)

| Width | Grid |
|---|---|
| `< sm` | 1 column. Facets wrap to two rows; the List/Map toggle and Sort sit on their own row. |
| `sm`–`lg` | 2 columns (`sm:grid-cols-2`). |
| `≥ lg` | 2 columns in the main content region (the global rail occupies the third track). Cards with `cover` read as a Luma-style gallery. |

The existing grid is `grid-cols-1 lg:grid-cols-2` — keep it; the global rail is the
de-facto third column, so a 3-up card grid would crowd. Cards stay 2-up.

---

## 4. Gamification & badge treatment — the token catalogue (both pages)

One table so badges read identically on a card, the band, and the aside. **No hex,
no `text-[Npx]`** — semantic DAWN tokens + `text-2xs`/`text-3xs` only.

| Badge / chip | Tokens | Rule |
|---|---|---|
| Zaps reward | `Zap` `text-primary` · `bg-primary-bg/40` pill · `text-2xs font-semibold text-text` | Mirrors `StandingTiles` compact tile. Never a KPI `StatCard` on an event. |
| Streak protect | `Flame` `text-primary-strong` (`text-subtle` at 0) | States what it keeps; never threatens loss. |
| Circle Current | `Activity` `text-signal` · `bg-signal-bg` · `text-signal-strong` | The only teal on the page; the canonical Circle Current tone. |
| Warm proof | `WarmProof` avatar pile + real count | Never-low floor enforced in the component. |
| "Filling up" | `text-primary-strong` · `bg-primary-bg` | Only when genuinely near-full (≤20% capacity). |
| Waitlist | `bg-surface-elevated text-muted` · `Clock` | Calm, not scarcity. |
| Attendance mode | per §2.4 (`broadcast-bg` online, `primary-bg` hybrid, `surface-elevated` in-person) | One chip in `badges`. |
| Demo (beta) | `DemoBadge` ✅ | Existing. |
| Cancelled | `bg-danger-bg border-danger text-danger` | Banner, top of page. |
| Confirmed / going | `bg-success-bg text-success` | The ONLY use of `success` tone — status, not chrome (CONTENT-VOICE/DESIGN-LANGUAGE: green is in-app status only). |
| Event Dispatch | `Radio` icon + `bg-primary-bg text-primary-strong` `text-3xs` pill on a host post | The "Dispatch with an event badge" of ADR-255. |

---

## 5. Reference JSX skeletons (compose the kit · DAWN tokens · no hex · no em dashes)

> Illustrative composition, not drop-in code — it shows *which kit components fill
> which slots* and the exact token classes. Real data fetching stays in the page as
> today; slow reads go behind `<Suspense>`.

### 5.1 `/events/[slug]` — The Invite

```tsx
import { Suspense } from 'react'
import Image from 'next/image'
import { MapPin, Video, Globe, Zap, Flame, Activity, QrCode } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { WarmProof } from '@/components/events/warm-proof'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { TicketButton } from '@/app/(main)/events/[slug]/ticket-button'
import { AddToCalendar } from '@/components/events/add-to-calendar'
import { EventActivity } from '@/components/events/event-activity'
import { RecapAlbum } from '@/components/events/recap-album'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

export default function InvitePage(/* … server fetch as today … */) {
  return (
    <DetailTemplate
      // [A1] cover — the one big visual win (slot already exists, today unused)
      hero={
        event.coverUrl ? (
          <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl bg-surface-elevated">
            <Image src={event.coverUrl} alt="" fill className="object-cover" priority />
          </div>
        ) : (
          <div className="aspect-[16/6] w-full rounded-2xl bg-surface-elevated" />
        )
      }
      title={event.title}
      // [A2] attendance-mode chip
      badges={
        <span className="inline-flex items-center gap-1 rounded-full bg-broadcast-bg px-2 py-0.5 text-2xs font-semibold text-broadcast-strong">
          <Video className="h-3 w-3" /> Online
        </span>
      }
      subtitle={/* when · where · host · scope · posted-by — as today */ null}
    >
      {/* [A3] EventRewardStrip — calm gamification chips, never KPI tiles */}
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border pb-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg/40 px-2.5 py-1 text-2xs font-semibold text-text">
          <Zap className="h-3 w-3 text-primary" /> +12 Zaps when you check in
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg/40 px-2.5 py-1 text-2xs font-semibold text-text">
          <Flame className="h-3 w-3 text-primary-strong" /> Keeps your 6-week streak
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-signal-bg px-2.5 py-1 text-2xs font-semibold text-signal-strong">
          <Activity className="h-3 w-3" /> Adds to Thursday Circle&rsquo;s Current
        </span>
        <WarmProof going={going} fromYourCircles={fromCircles} faces={faces} maybe={maybe} />
      </div>

      {/* TWO-COLUMN interior grid (no new template; plain grid in the body) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* [B] POST AREA — wide left, extra bottom pad clears the mobile bar */}
        <div className="min-w-0 space-y-8 pb-24 lg:pb-0">
          {event.description && (
            <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-text">
              {event.description}
            </p>
          )}
          <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
            {/* host posts render with a Dispatch event badge (ADR-255) */}
            <EventActivity eventId={event.id} slug={event.slug} posts={posts}
              canPost={canContribute} canModerate={isHost} myProfileId={myId} isPast={isPast} />
          </Suspense>
          {hasEnded && (
            <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
              <RecapAlbum eventId={event.id} slug={event.slug} photos={recap}
                canUpload={canContribute} canModerate={isHost} myProfileId={myId} />
            </Suspense>
          )}
        </div>

        {/* [C] JOIN AREA — narrow right, sticky on lg+ */}
        <aside className="space-y-4 self-start lg:sticky lg:top-20">
          {/* C1 primary action */}
          {isPaidEvent ? (
            <TicketButton eventId={event.id} priceLabel={priceLabel} tiers={tiers} />
          ) : (
            <RsvpControls eventId={event.id} status={myStatus} plusOnes={myPlusOnes} isFull={isFull} />
          )}
          {/* C3 at-RSVP calendar */}
          {isGoing && (
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted">You&rsquo;re going. Lock it in.</p>
              <AddToCalendar icsHref={icsHref} googleUrl={googleUrl} emphasis />
            </div>
          )}
          {/* C4 EventFactPanel — date · location + mini map · spots · guest list */}
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <p className="flex items-center gap-2 text-sm text-text">
              <MapPin className="h-4 w-4 text-subtle" /> {event.location}
            </p>
            {/* mini EventsMap when coordinates exist (city-level pin) */}
            <WarmProof going={going} faces={faces} nearFull={nearFull} spotsLeft={spotsLeft} />
            {/* guest list: names for Crew, count for others */}
          </div>
        </aside>
      </div>

      {/* MOBILE sticky action bar — hidden on lg+, hidden for host/past/cancelled */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <RsvpControls eventId={event.id} status={myStatus} plusOnes={myPlusOnes} isFull={isFull} />
      </div>
    </DetailTemplate>
  )
}
```

### 5.2 `/events` — The Catalog

```tsx
import { Suspense } from 'react'
import { IndexTemplate } from '@/components/templates'
import { FacetDropdown } from '@/components/ui/facet-dropdown'
import { DirectorySearch } from '@/components/ui/directory-search'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EventsMapToggle } from '@/components/events/events-map-client'
import { CalendarDays } from 'lucide-react'

export default function CatalogPage(/* … server fetch + facets as today … */) {
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <DirectorySearch paramKey="q" placeholder="Search events" />
      <FacetDropdown label="Category" paramKey="category" options={CATEGORY_OPTIONS} />
      <FacetDropdown label="Format"   paramKey="format"   options={FORMAT_OPTIONS} />
      <FacetDropdown label="Date"     paramKey="date"     options={DATE_OPTIONS} />
      <FacetDropdown label="Price"    paramKey="price"    options={PRICE_OPTIONS} />
      <FacetDropdown label="Spots"    paramKey="spots"    options={SPOTS_OPTIONS} />
      {myGeocell && <FacetDropdown label="Distance" paramKey="near" options={NEAR_OPTIONS} />}
      <FacetDropdown label="Sort"     paramKey="sort"     options={SORT_OPTIONS} />
    </div>
  )

  return (
    <IndexTemplate title={pageTitle} description={pageDescription} action={headerActions} toolbar={toolbar}>
      {/* For You — streamed, cold-start-safe (renders null without signal) */}
      {showForYou && (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-elevated/50" />}>
          <ForYouLane /* … */ />
        </Suspense>
      )}

      <section id="events-upcoming">
        <SectionHeader title="Upcoming" count={filtered.length} />
        {filtered.length === 0 ? (
          <EmptyState
            variant={filtering ? 'no-results' : 'first-use'}
            icon={CalendarDays}
            title={filtering ? 'No events match these filters' : 'Nothing near you yet'}
            description={filtering ? 'Try a wider date or clear a filter.' : 'Join a circle and gatherings show up here.'}
          />
        ) : (
          <EventsMapToggle pins={mapPins}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((e) => (
                <EventCard key={e.id} event={e} /* cover when present */ />
              ))}
            </div>
          </EventsMapToggle>
        )}
      </section>
    </IndexTemplate>
  )
}
```

---

## 6. Build checklist (what the engineer does — no shell edits)

| # | Change | Files | Status |
|---|---|---|---|
| 1 | Rail → `'none'` for the slug | `lib/layout/page-chrome.ts` (+ test) | ⚠️ one line |
| 2 | Cover image into the `hero` slot | `app/(main)/events/[slug]/page.tsx` | ⏳ |
| 3 | Two-column interior grid + sticky aside + mobile bottom bar | `app/(main)/events/[slug]/page.tsx` | ⏳ layout |
| 4 | `EventRewardStrip` (Zaps/check-in/streak/Current chips) | `components/events/event-reward-strip.tsx` | ⚠️ new |
| 5 | `EventFactPanel` (date/map/spots/guests aside card) | `components/events/event-fact-panel.tsx` | ⚠️ new |
| 6 | Dispatch badge on host posts; Boops + GIF in comments | `components/events/event-activity.tsx` | ⏳ |
| 7 | +1 names + Request-to-join props | `components/events/rsvp-controls.tsx` | ⏳ |
| 8 | Format / Date / Price facets + Sort + search | `app/(main)/events/page.tsx` | ⏳ |
| 9 | Cover on `EventCard`; hybrid public-event union | `app/(main)/events/page.tsx` | ⏳ |
| 10 | Per-section `<Suspense>` on feed/recap/guest-list/connector | both pages | ⏳ |

**Two new components only** (`EventRewardStrip`, `EventFactPanel`) — both thin,
presentational, server-friendly compositions of existing pieces. Everything else is
slot-filling and prop-adding on the established kit. The app shell, top nav, and
global navigation chrome are never touched.

---

## 7. Copy bank (run through CONTENT-VOICE §10 — voice-checked, no em dashes)

| Surface | Copy |
|---|---|
| Empty RSVP | `Be the first to RSVP.` / `Your circles will see you're going.` |
| Going confirm | `You're going. Lock it in so you don't miss it.` |
| Waitlist | `On the waitlist. We'll let you in if a spot opens.` |
| Filling up | `Filling up. 3 spots left.` |
| Reward chip | `+12 Zaps when you check in.` |
| Streak chip | `Keeps your 6-week streak.` |
| Past event | `Say thanks, share a moment, tag a friend.` |
| Cancelled | `This event has been cancelled.` |
| Catalog empty | `Nothing near you yet. Join a circle and gatherings show up here.` |
| No-results | `No events match these filters. Try a wider date or clear a filter.` |
| Request to join | `Request sent. The host will confirm.` |

All pass the skeptic test, narrate no feelings, carry the proper nouns (Zaps, Circle
Current, Dispatch) while the sentences stay plain, and use no em dashes.

---

## 8. Sources (build on EVENTS-REWORK's research; new for this design pass, 2026-06-14)

- **Partiful** — guest list browsing, comment threads, **Boops** (RSVP reactions),
  text blasts, **photo albums**, co-hosts, **capacity limits with automatic
  waitlists**, animated/expressive pages: [party.pro/partiful](https://party.pro/partiful/),
  [Wikipedia: Partiful](https://en.wikipedia.org/wiki/Partiful).
- **Luma** — minimal-input **beautiful event pages** (cover + RSVP + calendar +
  sharing auto-generated), registration questions, **themes/customization**, mobile
  experience, calendar subscriptions: [party.pro/luma](https://party.pro/luma/),
  [Luma themes help](https://help.luma.com/p/event-themes-and-customization),
  [Luma create](https://luma.com/create).
- **Eventbrite** — listing best practices, **filters by time/venue/location**, grid
  column controls, 2026 SEO focus: [Eventbrite listing best practices](https://www.eventbrite.com/blog/event-listing-best-practices/),
  [Event filters (Event Feed)](https://eventfeed.click/docs/event-filters/),
  [responsive grid columns](https://eventfeed.click/docs/responsive-settings/),
  [2026 roadmap](https://www.eventbrite.com/product-updates/roadmap-2026/).
- **Sticky CTA / two-column + mobile bottom bar** — sticky call-to-action and
  sticky-sidebar UX guidance: [GoodUI #41 Sticky CTA](https://goodui.org/patterns/41/),
  [Smashing: sticky menus UX](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/).
- Prior research catalogued in [`EVENTS-REWORK.md`](EVENTS-REWORK.md) §"Best
  practices distilled" and §"Sources" — this pass builds on it, not over it.

---

*Companion docs: [`EVENTS-REWORK.md`](EVENTS-REWORK.md) (plan of record, ADR-254/255/256),
[`PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md) (templates + chrome), [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md)
(DAWN tokens), [`NAMING.md`](NAMING.md) + [`CONTENT-VOICE.md`](CONTENT-VOICE.md) (canon + voice).
Authority: running code + `supabase/migrations/` > this doc. Owner: Daniel (Vision Steward).*
