# Page Framework — uniform nested layouts + assignable widgets

> How every page on Frequency is **structured, composed, and kept fast**. The
> goal: one consistent shell, a tiny set of page templates, and features that
> drop in as **assignable widgets** without rebuilding pages. Pairs with
> [IA-STRATEGY.md](IA-STRATEGY.md) (what the features *are*) — this doc is *how
> they're laid out*.
>
> **Stack note:** Next.js 16 (App Router) + React 19. This relies on stable App
> Router primitives — nested layouts, Server Components, Suspense streaming. Any
> *caching* API (`use cache` / Partial Prerendering / `cacheLife`) must be
> verified against the installed Next 16 docs before use — Next 16 changed
> caching semantics and `node_modules` isn't always present to confirm.
>
> ⚠️ **Terminology (read this):** this doc predates the "module" reframe and says
> **"widget."** Treat **widget = the presentational card chrome only**. *Which*
> module appears, for *whom*, is decided server-side per user by role +
> involvement — that's **server-composed capability modules**, not a static
> widget board. The authoritative model is in
> [SCALE-ARCHITECTURE.md](SCALE-ARCHITECTURE.md) ("server-composed capability
> modules") and [CAPABILITIES-AND-MOBILE.md](CAPABILITIES-AND-MOBILE.md) (the
> capability resolver). Read "widget" here as "module's card UI."

---

## 1. The principle: fractal shell, few templates, many widgets

Three layers, each with a different rate of change:

| Layer | Changes | Examples |
|---|---|---|
| **Shell** (global frame) | almost never | header, left nav, right rail container |
| **Templates** (page archetypes) | rarely | Stream, Index, Detail |
| **Widgets** (features) | constantly | events card, members card, program card, a new stat |

The whole strategy is **separation by rate of change**: lock the shell and
templates so the product feels uniform, and let features accrete as widgets so
you never touch a page to add a function. This is what makes it scale.

---

## 2. The shell (already built — keep it)

`components/layout/app-shell.tsx` is the global frame and it's the right shape:

```
┌─ Header: logo · search · messages · notifications · account/admin ─┐
├──────────┬───────────────────────────────────┬───────────────────┤
│ Left nav │            Main content            │   Right rail      │
│ (global) │       (template renders here)      │ (widgets, global) │
└──────────┴───────────────────────────────────┴───────────────────┘
```

It already takes the right rail as a **slot prop** (`sidebar`) and already
toggles it off for focus pages (`showSidebar`). That slot-prop instinct is the
seed of the whole widget system below — we generalize it.

The **fractal**: the *same* header / content / rail grammar repeats inside an
entity page (a Circle, a Topic) at a smaller scale (§3, Template C). One spatial
logic, learned once, reused at every level.

---

## 3. Three page templates (the "every page fits" guarantee)

Every page is one of three shapes, chosen by *what the content is*, not by
feature. A page never invents its own layout — it picks a template and fills
slots.

### Template A — **Stream** (a flow of items)
One primary column of a vertical card stream + right rail.
- **Use:** Feed, Broadcast, a Circle's discussion, a Topic's discussion.
- **Slots:** `streamTop` (composer / pinned), the stream itself, `rightRail`.

### Template B — **Index** (a collection to browse)
Filter/sort bar + responsive grid or list of cards + right rail.
- **Use:** Circles, Topics, Events, People/Directory.
- **Slots:** `indexFilters`, the grid, `rightRail`.

### Template C — **Detail** (a single entity — the *nested page*)
Context header band + context tabs + body + **scope-aware** right rail.
- **Use:** one Circle, one Topic, one Event, one Profile, (admin) one Hub/Nexus.
- **Slots:** `headerActions` (join/share/admin gear), `contextTabs`, the body,
  `rightRail`.
- **Key idea:** the body of a Detail page is *itself usually a Stream or an
  Index* (a Circle's "Posts" tab = Stream; its "Events" tab = Index). Templates
  **nest** — that's the fractal, and it means you reuse, never rebuild.

> **Update (§8, ADR-090):** Focus and Dashboard are now **real templates** too —
> `FocusTemplate` (the no-rail compose/edit/settings surface, formerly just "the
> shell hiding the rail") and `DashboardTemplate` (the metric-led operator
> workspace). All five share one `PageHeading`. See §8 for the full kit + the
> declarative rail map (`lib/layout/page-chrome.ts`).

### How templates map to Next.js
- A **Detail** page = a route-segment **`layout.tsx`** (e.g.
  `app/(main)/circles/[slug]/layout.tsx`) that renders the context header + tabs
  + scoped rail and slots the tab pages as `children`. Navigating between tabs
  **preserves** the header and rail (partial rendering) — free performance.
- Stream/Index are usually plain `page.tsx` files that compose the shared
  template components.

---

## 4. The widget system (assignable features without rebuilds)

This is the answer to *"add different functions depending on the page… like
widgets that show up when assigned… without rebuilding every page."*

### 4.1 Anatomy of a widget
A widget is a **self-contained module** colocated with its data:

```ts
// lib/widgets/registry.ts (shape, not final code)
type Widget = {
  id: string                       // 'upcoming-events'
  slot: SlotName                   // 'rightRail' | 'streamTop' | 'headerActions' | ...
  scopes: ScopeKind[]              // where it's allowed: ['global','circle','topic']
  gate?: Gate                      // role/milestone gate (see IA-STRATEGY §2)
  fallbackHeight: number           // for a layout-shift-free skeleton
  Component: (p: { scope: Scope }) => Promise<JSX.Element | null>  // async RSC
}
```

Rules that make widgets cheap and safe:
- **Fetches its own data on the server** (it's an async Server Component). No
  client fetch, no waterfall.
- **Returns `null` when it has nothing** — so "assigned but not relevant" costs
  one query and renders nothing. (The current right-rail widgets already do this.)
- **Declares its scopes + gate as metadata** — the renderer, not the page,
  decides whether to show/lock it.

### 4.2 Scope — the cascade
The thing that lets *one* widget work at every level is a typed **scope** passed
down from the (Detail) layout:

```ts
type Scope =
  | { kind: 'global' }
  | { kind: 'circle';  id: string; hubId?: string; nexusId?: string }
  | { kind: 'topic';   id: string }
  | { kind: 'event';   id: string }
  | { kind: 'profile'; id: string }
```

The same `UpcomingEvents` widget renders community-wide events at `global` and
*this circle's* events at `circle` — because it reads `scope`. That's the
"cascading features" you described: behavior cascades from context, definition
stays single.

### 4.3 Assignment — one declarative config
Which widgets appear where lives in **one map**, not in pages:

```ts
// lib/widgets/layout-config.ts (illustrative)
export const RAIL = {
  global: ['announcements','getting-started','dispatches','upcoming-events','members','leaderboard'],
  circle: ['announcements','program','upcoming-events','members','dispatches'],
  topic:  ['program','circles-in-topic','upcoming-events'],
  event:  ['attendees','location-map','host-card'],
} satisfies Record<ScopeKind, string[]>
```

**Adding a feature = write a widget module + add its `id` to a list here.** Zero
page edits. Removing/ reordering = edit the list. This is the scalability
property.

### 4.4 The only thing pages call: `<WidgetSlot>`
```tsx
<WidgetSlot name="rightRail" scope={scope} role={role} milestones={ms} />
```
`WidgetSlot` looks up the assigned ids for `(name, scope.kind)`, filters by
`gate` (role + milestone — locked widgets render a lock card, see IA-STRATEGY
§2), and renders each widget **inside its own `<Suspense>`** with a
dimension-matched skeleton.

### 4.5 Uniform chrome
Every widget is wrapped in the shared **`WidgetCard`** shell (already exists in
`right-sidebar.tsx` — promote it to `components/widgets/widget-card.tsx`). Same
border, header, padding everywhere → uniformity is structural, not a thing
authors have to remember.

> **Native alternative for a couple of stable slots:** Next.js **Parallel Routes**
> (`@rail`, `@header` folders) give file-based independent slots with their own
> streaming/loading. Good for a few fixed slots; the **config-driven
> `WidgetSlot`** above is better for *dynamic, per-scope, per-role* assignment.
> Use both: parallel routes for structure, `WidgetSlot` for content.

---

## 5. Performance — how this stays fast (the explicit requirement)

Widget dashboards get slow when every widget fetches on the client and they
waterfall. This architecture avoids that by construction. Best practices, in
priority order:

1. **Server Components by default; `"use client"` only at interactive leaves**
   (a like button, a filter). Static widgets ship **zero JS** ("islands" / the
   donut pattern: a client shell can still take server children).
2. **One Suspense boundary per widget; fetches run in parallel.** Sibling Server
   Components start their fetches simultaneously, so total wait = the *slowest*
   widget, not the sum. The shell paints instantly and widgets stream in.
3. **Never block the shell on slow work.** Don't `await` slow data in the
   layout/page *before* returning JSX — push it into a Suspense child, or
   streaming can't begin (the #1 RSC pitfall).
4. **Dimension-matched skeletons** (`fallbackHeight`) so streamed widgets don't
   cause layout shift (CLS).
5. **Hoist shared scope data once** in the Detail layout (e.g. "my membership in
   this circle", the circle row) and pass it down — don't let N widgets each
   re-query it. (Right rail already fetches memberships once and passes
   `circleIds` down — keep that pattern.)
6. **Nested layouts = partial rendering.** Tab/sub-page navigation inside an
   entity reuses the header + rail without re-rendering or re-fetching them.
7. **Cache the slow + shared + non-personalized** widgets (leaderboard, topic
   metadata) via Next 16's caching layer; keep per-user widgets dynamic.
   *Confirm the exact API against the installed Next 16 docs before adopting it.*

Sources: [RSC streaming performance (SitePoint)](https://www.sitepoint.com/react-server-components-streaming-performance-2026/) ·
[Streaming layouts & Suspense (BitsKingdom)](https://bitskingdom.com/blog/nextjs-streaming-layouts-react-suspense/) ·
[RSC performance pitfalls (LogRocket)](https://blog.logrocket.com/react-server-components-performance-mistakes) ·
[`<Suspense>` (React docs)](https://react.dev/reference/react/Suspense)

---

## 6. Route → template → rail map (proof the framework fits everything)

| Route | Template | Notable rail / slot widgets |
|---|---|---|
| `/feed` | Stream | getting-started, dispatches, upcoming-events, members, leaderboard |
| `/broadcast` | Stream | announcements, dispatches |
| `/circles` | Index | filters (multi-topic + mode), my-circles, pulse |
| `/circles/[slug]` | **Detail** | header(join/admin) · tabs(Posts/Events/Members/About) · rail: program, this-circle events, members, dispatches |
| `/channels` → Topics | Index | filters (category), tuned-in, pulse |
| `/channels/[id]` → Topic | **Detail** | header(start-a-circle) · tabs(About/Discussion/Circles/Program) · rail: program, circles-in-topic, events |
| `/events` | Index | filters (in-person/virtual, date), upcoming |
| `/events/[slug]` | **Detail** | header(RSVP/ICS) · rail: attendees, location, host |
| `/people` | Index | filters (circle/rank/online), online-now |
| `/people/[handle]` → Profile | **Detail** | header · tabs · rail: achievements, streaks, circles |
| `/messages`, `/settings`, compose | Focus | (no rail) |
| `/crew/*` | Stream/Index | gamification widgets |
| `/admin/*` | Index/Detail | admin sub-nav (own pattern) — *being absorbed into the per-page **admin dock** (ADR-128, Phase 1) → capability-driven modules + in-place editing (ADR-132 / EMBEDDED-ADMIN.md, Phase 2)* |

Every page lands in a template; every feature lands in a widget. Nothing needs a
bespoke layout.

---

## 7. Migration path (incremental, low-risk — Phase 0–1 shipped)

> **Update 2026-06-02:** the template migration shipped (PRs #81–93, see
> [REDESIGN-INAPP.md](REDESIGN-INAPP.md)). `Index`/`Stream`/`Detail` templates are live;
> `DetailTemplate` is adopted by Circle/Channel/Event (step 4–5, in progress — Profile/Programs
> remain). The capability-module/`WidgetSlot` system (steps 1–2) is still a future seam, not yet
> built; the right rail remains hand-wired.

1. **Extract** the shared shell pieces that exist informally:
   `WidgetCard` → `components/widgets/widget-card.tsx`; a `Scope` type;
   `<WidgetSlot>`.
2. **Codify** the right rail as a `WidgetSlot name="rightRail"` driven by
   `layout-config.ts` (it's already a hand-wired version of this).
3. **Templatize** Stream and Index as thin shared components; convert `/feed`
   and `/circles` first.
4. **Introduce the Detail layout** at `circles/[slug]/layout.tsx` (header + tabs +
   scoped rail); make the rail scope-aware (`global` → `circle`).
5. **Roll** the Detail pattern to Topics, Events, Profiles.
6. Thereafter, **new features are widgets + a config line** — never a new page
   layout.

Order is deliberately additive: each step is shippable on its own and nothing
forces a big-bang rewrite.

---

## 8. The kit today — five shells + one chrome map (build a page)

> **Update 2026-06-05 (ADR-090):** the template kit is now complete and the
> shell's rail treatment is **declarative**. "Focus" and "Dashboard" are no longer
> informal — they're real templates next to Stream / Index / Detail. A page is now
> *two lines of decision*: pick a template, register a rail.

### 8.1 The five templates — `@/components/templates`

| Template | Import | Use it for | Header / slots |
|---|---|---|---|
| **Stream** | `StreamTemplate` | a flow of items: Feed, Broadcast, a circle discussion | `eyebrow·title·description·action·composer` |
| **Index** | `IndexTemplate` | a collection to browse: Circles, Channels, Events, People, Search | `title·description·action·toolbar` |
| **Detail** | `DetailTemplate` | one entity: a Circle, Event, Profile, Hub, Program | context band (`badges·actions`) + `tabs` |
| **Dashboard** | `DashboardTemplate` | a metric-led operator/steward workspace: Marketing, CRM, Crew home | `eyebrow·title·description·actions·stats` + sections |
| **Focus** | `FocusTemplate` | a centered, no-rail surface: compose/edit forms, Settings, single-conversion + scan-confirm | `eyebrow·title·description·actions·back·width` |

All five share **one header grammar** (`PageHeading`) — same type scale, eyebrow,
description, action slot — so titles read identically everywhere. Detail keeps a
richer context band (identity + badges + tab row) but on the same scale. The
admin equivalent of Dashboard is `<AdminPage>` (a rail-less sibling under
`/admin/*`'s own two-layer nav).

**Body primitives (compose, never re-declare):** `EntityCard`/`PersonCard` (browse
cards), `StatCard` (KPI tile with delta/drill-down), `SectionHeader`, `EmptyState`,
`ModuleCard`/`SidebarCard` (rail/admin panels).

### 8.2 The chrome map — `lib/layout/page-chrome.ts`

Which rail frames a page is **one pure function**, `railFor(pathname)`, returning:

- `'global'` — the community right rail (browse / stream / dashboard default).
- `'scoped'` — global rail suppressed; the **Detail** page renders its own scope
  rail in-body (no double-rail trap). Sections: `/circles/*`, `/channels/*`.
- `'none'` — **Focus**: no rail. Compose/edit (`/events/new`,
  `/practices/*/edit`, `/connections/*`), settings, message threads, and the
  operator/steward workspaces (`/marketing`, `/crm`, `/outreach`, `/codes`,
  `/upgrade`, `/g/*`, `/n/*`).

`app-shell.tsx` shows the global rail iff `railFor(pathname) === 'global'`. **To
reframe a route, edit `page-chrome.ts` — never the shell.** Locked by
`page-chrome.test.ts`.

### 8.3 Build a page — the decision tree

1. **What is the content?** → pick the template from the table above.
2. **Does it read best full-width (a form, a workspace, a single decision)?** →
   add its route to a Focus list in `page-chrome.ts` and use `FocusTemplate`.
   Otherwise it keeps the global rail (or is `'scoped'` if it's a circle/channel
   detail that renders its own rail).
3. **Fill slots with kit primitives.** No hand-rolled `<h1>` headers, no bespoke
   cards, no `text-[10/11px]`, no hardcoded hex.
4. **Don't block the shell.** Server-fetch in the page; push slow/independent
   queries behind per-section `<Suspense>` (§5).

That's the whole contract. A new feature is a template choice + a chrome line, not
a new layout.

---

## Decisions captured

- **One shell, FIVE templates (Stream / Index / Detail / Dashboard / Focus)** — all
  on one `PageHeading` grammar; the rail is a declarative `page-chrome.ts` map, not
  shell-baked conditionals (ADR-090).
- **Features are widgets**: self-fetching Server Components, scope-aware,
  gate-aware, returning null when empty, wrapped in a uniform `WidgetCard`.
- **Assignment is one declarative config**; pages only render `<WidgetSlot>`.
- **Speed is structural**: RSC + per-widget Suspense + parallel fetch + nested
  layouts + dimension-matched skeletons; client JS only at interactive leaves.
- **Gating (role + milestone, IA-STRATEGY §2) is widget metadata** — the same
  mechanism powers the "wake up" progressive reveal.
