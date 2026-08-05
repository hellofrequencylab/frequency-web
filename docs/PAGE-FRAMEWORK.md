# Page Framework: uniform nested layouts + assignable widgets

> How every page on Frequency is **structured, composed, and kept fast**. The
> goal: one consistent shell, a tiny set of page templates, and features that
> drop in as **assignable widgets** without rebuilding pages. Pairs with
> [IA-STRATEGY.md](IA-STRATEGY.md) (what the features *are*). This doc is *how
> they're laid out*.
>
> **Stack note:** Next.js 16 (App Router) + React 19. This relies on stable App
> Router primitives: nested layouts, Server Components, Suspense streaming. Any
> *caching* API (`use cache` / Partial Prerendering / `cacheLife`) must be
> verified against the installed Next 16 docs before use. Next 16 changed
> caching semantics and `node_modules` isn't always present to confirm.
>
> ⚠️ **Terminology (read this):** this doc predates the "module" reframe and says
> **"widget."** Treat **widget = the presentational card chrome only**. *Which*
> module appears, for *whom*, is decided server-side per user by role +
> involvement, that's **server-composed capability modules**, not a static
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

## 2. The shell (already built, keep it)

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
seed of the whole widget system below: we generalize it.

The **fractal**: the *same* header / content / rail grammar repeats inside an
entity page (a Circle, a Topic) at a smaller scale (§3, Template C). One spatial
logic, learned once, reused at every level.

---

## 3. Three page templates (the "every page fits" guarantee)

Every page is one of three shapes, chosen by *what the content is*, not by
feature. A page never invents its own layout: it picks a template and fills
slots.

### Template A: **Stream** (a flow of items)
One primary column of a vertical card stream + right rail.
- **Use:** Feed, Broadcast, a Circle's discussion, a Topic's discussion.
- **Slots:** `streamTop` (composer / pinned), the stream itself, `rightRail`.

### Template B: **Index** (a collection to browse)
Filter/sort bar + responsive grid or list of cards + right rail.
- **Use:** Circles, Topics, Events, People/Directory.
- **Slots:** `indexFilters`, the grid, `rightRail`.

### Template C: **Detail** (a single entity, the *nested page*)
Context header band + context tabs + body + **scope-aware** right rail.
- **Use:** one Circle, one Topic, one Event, one Profile, (admin) one Hub/Nexus.
- **Slots:** `headerActions` (join/share/admin gear), `contextTabs`, the body,
  `rightRail`.
- **Key idea:** the body of a Detail page is *itself usually a Stream or an
  Index* (a Circle's "Posts" tab = Stream; its "Events" tab = Index). Templates
  **nest**: that's the fractal, and it means you reuse, never rebuild.

> **In-body sidebar (was "Template D", `HeaderSidebarTemplate`) — retired 2026-08-05.**
> A wide main column beside a narrower in-body panel (filters, a summary card, related
> links) is now a **slot on Detail**, not a shell of its own: `DetailTemplate`'s optional
> `sidebar` slot renders that exact geometry (content first on mobile, `lg:w-80` beside it
> above that). `HeaderSidebarTemplate` and its peer `TwoColumnTemplate` (two equal columns)
> shipped as kit shells but were never once composed by a page; both were deleted rather
> than left as a canon nobody could point at. Need two peer columns? Use a grid inside
> whichever shell the content actually is — an in-body layout is not a page archetype.
>
> ⚠️ **The in-body sidebar does NOT change the rail.** An earlier version of this section
> said a page with its own sidebar "should usually register as `'scoped'`". That is no
> longer true and it is not what the code does: **nothing is `'scoped'` today** and the
> global community rail shows on every member page (owner directive 2026-06-20, reaffirmed
> 2026-07-28 — see §8.2). The Channel detail page proves the pattern: its activity/upcoming
> column renders IN-BODY through `DetailTemplate`'s `sidebar`, *beside* the shell rail. The
> two coexist because they are different things — one is the page's own facts, the other is
> the site's chrome. If an interior feels like a doubled column, the fix is to make that
> interior templated/movable (blocks or `PageModules`), **never** to remove the rail. That
> holds hardest on the events DETAIL page (`/events/<slug>`), which ALWAYS keeps `'global'`;
> a past change dropped it and was reverted.

> **Update (§8, ADR-090):** Focus and Dashboard are now **real templates** too:
> `FocusTemplate` (a centered, single-task compose/edit/settings surface) and
> `DashboardTemplate` (the metric-led operator workspace). With **`WizardShell`** (the
> multi-step flow shell), **`RailGrid`** (a filter rail beside a fluid card grid), and
> **`AdminTemplate`** (the `/admin/*` workspace), the kit is now **eight shells**, all
> sharing one `PageHeading`. See §8 for the full kit + the declarative rail map
> (`lib/layout/page-chrome.ts`).

### How templates map to Next.js
- A **Detail** page = a route-segment **`layout.tsx`** (e.g.
  `app/(main)/circles/[slug]/layout.tsx`) that renders the context header + tabs
  + scoped rail and slots the tab pages as `children`. Navigating between tabs
  **preserves** the header and rail (partial rendering): free performance.
- Stream/Index are usually plain `page.tsx` files that compose the shared
  template components.

---

## 4. The widget system (assignable features without rebuilds)

This is the answer to *"add different functions depending on the page… like
widgets that show up when assigned… without rebuilding every page."*

> ✅ **Shipped: the per-route module-assignment engine (ADR-270 + ADR-271 + ADR-272, 2026-06-15).**
> A page's **interior** modules are assigned per route and tuned from the on-page Layout editor,
> with a **scope cascade** (route → section → global), a **per-module role gate**, and now an
> interior **layout/grid + slot** model: pick one of six **interior layouts** (a grid shape) and
> drop each module into an **area (slot)** of it (the concrete landing of the `<WidgetSlot>` sketch
> below). What exists today:
>
> ⚠️ **Naming (Phase 0.5.11), two different things both once called "templates":** the **page
> shells** in [`@/components/templates`](../components/templates/index.ts) (Stream / Detail / Focus /
> WizardShell / …; see §8) are the OUTER page archetype. The module engine's
> [`lib/widgets/templates.ts`](../lib/widgets/templates.ts) `TEMPLATES` are a DIFFERENT, smaller
> thing: the **interior layouts/grids** (Single · Main + side · 2 columns · 3 columns · Header +
> sidebar · Header + 2 columns · Header / Main / Sidebar / Footer) that arrange modules WITHIN a
> page's body. This doc calls the latter
> **"interior layouts/grids"** in prose to avoid the collision; the code identifiers
> (`templates.ts` / `TemplateId` / `TEMPLATES`) are unchanged.
>
> | Concern | Where | Note |
> |---|---|---|
> | **Module catalog** (metadata only) | [`lib/widgets/modules.ts`](../lib/widgets/modules.ts) | `LAYOUT_MODULES` / `moduleMeta` (union of every block) + **route scoping** (ADR-294): `ROUTE_MODULE_IDS` / `moduleIdsForScope` map a scope key → the ids that page offers, so a page only shows/renders ITS OWN blocks, no React, so the editor / actions / resolver never import RSCs |
> | **Interior layouts/grids** (metadata only, ADR-272) | [`lib/widgets/templates.ts`](../lib/widgets/templates.ts) | `TEMPLATES` / `templateMeta` / `slotIds` / `defaultSlotId`: 7 interior layouts/grids (Single · Main + side · 2 columns · 3 columns · Header + sidebar · Header + 2 columns · Header / Main / Sidebar / Footer) naming their slots; no React, like the module catalog. Distinct from the OUTER page shells in `@/components/templates` (§8). Add an interior layout = one entry here + a grid case in `page-modules.tsx`. **Module card grids should flex to their slot** via container-query breakpoints (`@md`/`@3xl`), so the same grid reads 1-up in a Sidebar slot, 2-up in Main, 3-up full-width (e.g. the Practice library). `EntityCard` carries `coverAspect` (`'video'` 16:9 / `'short'` 16:7 for denser catalogs) and `metaNoWrap` (keep the stats on one row — fixed stats `shrink-0`, one descriptive span `truncate`). |
> | **Component binding** | [`lib/widgets/registry.tsx`](../lib/widgets/registry.tsx) | `componentFor(id)` binds each id to its self-fetching RSC ([`components/widgets/`](../components/widgets)) |
> | **Resolver** (pure, unit-tested) | [`lib/page-settings/layout.ts`](../lib/page-settings/layout.ts) | `resolveSlots` / `moduleAssignments`: maps each module to one slot of the chosen interior layout (unplaced → default slot), back-compat reader (`parseLayout`) reads a legacy flat config as the Single layout's `main` slot |
> | **Renderer** | [`components/widgets/page-modules.tsx`](../components/widgets/page-modules.tsx) | `<PageModules route>`: lays out the interior layout's grid, each slot's modules each in its own `<Suspense>` (§5), `null` when empty |
> | **Storage** | `page_settings.layout` jsonb `{template, slots}` (each slot `{order,hidden,roles}`; the `template` key holds the interior-layout id) | reused from the page-settings store; shape evolved behind the back-compat reader (no new migration) |
> | **Scope cascade** (ADR-271) | [`lib/page-settings/{layout.ts,store.ts}`](../lib/page-settings) | a layout saves at the exact route, its section (`/seg/*`), or global (`*`); `loadLayoutForRoute` resolves most-specific-wins |
> | **Per-module role gate** (ADR-271) | `resolveSlots` + [`viewer-role.ts`](../lib/page-settings/viewer-role.ts) | per-slot `roles[id]` = lowest community rung to see a module; view-as-aware, fail-closed |
> | **Editor** | [`components/admin/page-settings/layout-editor.tsx`](../components/admin/page-settings/layout-editor.tsx) | the on-page Layout settings row (template picker + modules grouped by slot, each with an Area selector + toggle + reorder + per-module "Who sees it"), under the scope switch, staff-gated; section is `live` in [`lib/page-settings/sections.ts`](../lib/page-settings/sections.ts) |
>
> **Add a module:** one meta entry in `modules.ts` + bind its component in `registry.tsx`.
> **Add a page's own blocks (ADR-294):** declare its set in `ROUTE_MODULE_IDS` and list the route
> in [`module-routes.ts`](../lib/widgets/module-routes.ts) so the Layout editor appears there: the
> page becomes a header + `<PageModules route="…" />`, each block a self-fetching RSC (the
> migration target: no hand-built sections). **Slot-aware blocks (ADR-295):** each slot is a
> Tailwind v4 `@container`, so a block sizes to the slot it lands in via `@`-variants
> (`@lg:`/`@2xl:`), not the viewport. Prefer those over `sm:`/`md:` for a block's internal grid
> so it stays portable across main/side/column slots. **Assign per route:** open the page's on-page
> **Layout** settings (pick an interior layout/grid, drop each module into a slot, set order +
> visibility, stored per route); or render `<PageModules route="…" />` on a page (live on `/lead`
> — a 10-block leadership dashboard (ADR-403); `/pages` — the operator workspace (ADR-402);
> `/crew` My Quest, `/journeys`, and `/admin/content/journeys`). This is the page's interior column,
> **not** the app shell rail (that stays operator-managed in `/admin/page-layout` /
> `page_chrome_overrides`, ADR-259/260). **`quest-tasks` is a PARKED module** (Phase 0.5.11): its
> metadata + component stay defined in `lib/widgets/{modules,registry}`, but it was retired from My
> Quest (`/crew`) by owner ask and is offered on no page today; kept for a future surface, not drift.

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
- **Returns `null` when it has nothing**: so "assigned but not relevant" costs
  one query and renders nothing. (The current right-rail widgets already do this.)
- **Declares its scopes + gate as metadata**: the renderer, not the page,
  decides whether to show/lock it.

### 4.2 Scope: the cascade
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
*this circle's* events at `circle`, because it reads `scope`. That's the
"cascading features" you described: behavior cascades from context, definition
stays single.

### 4.3 Assignment: one declarative config
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
`gate` (role + milestone: locked widgets render a lock card, see IA-STRATEGY
§2), and renders each widget **inside its own `<Suspense>`** with a
dimension-matched skeleton.

### 4.5 Uniform chrome
Every widget is wrapped in the shared **`WidgetCard`** shell (already exists in
`right-sidebar.tsx`, promote it to `components/widgets/widget-card.tsx`). Same
border, header, padding everywhere → uniformity is structural, not a thing
authors have to remember.

> **Native alternative for a couple of stable slots:** Next.js **Parallel Routes**
> (`@rail`, `@header` folders) give file-based independent slots with their own
> streaming/loading. Good for a few fixed slots; the **config-driven
> `WidgetSlot`** above is better for *dynamic, per-scope, per-role* assignment.
> Use both: parallel routes for structure, `WidgetSlot` for content.

---

## 5. Performance: how this stays fast (the explicit requirement)

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
   layout/page *before* returning JSX: push it into a Suspense child, or
   streaming can't begin (the #1 RSC pitfall).
4. **Dimension-matched skeletons** (`fallbackHeight`) so streamed widgets don't
   cause layout shift (CLS).
5. **Hoist shared scope data once** in the Detail layout (e.g. "my membership in
   this circle", the circle row) and pass it down: don't let N widgets each
   re-query it. (Right rail already fetches memberships once and passes
   `circleIds` down, keep that pattern.)
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
| `/circles` | **Editable index** (`MarketHero` + `BlockRender`, §8.5) | filters (multi-topic + mode), my-circles, pulse |
| `/circles/[slug]` | **Detail** | header(join/admin) · tabs(Posts/Events/Members/About) · rail: program, this-circle events, members, dispatches |
| `/channels` → Topics | **Editable index** (`MarketHero` + `PageModules`, §8.5) | filters (category), tuned-in, pulse |
| `/channels/[id]` → Topic | **Detail** | header(start-a-circle) · tabs(About/Discussion/Circles/Program) · rail: program, circles-in-topic, events |
| `/events` | **Editable index** (`MarketHero`, §8.5) | filters (in-person/virtual, date), upcoming |
| `/events/[slug]` | **Detail** | header(RSVP/ICS) · rail: attendees, location, host |
| `/people` | Index | filters (circle/rank/online), online-now |
| `/people/[handle]` → Profile | **Detail** | header · tabs · rail: achievements, streaks, circles |
| `/messages`, `/settings`, compose | Focus | centered body, **and the global rail stays** (§8.2) |
| `/crew/*` | Stream/Index | gamification widgets |
| `/admin/*` | Index/Detail | admin sub-nav (own pattern): *being absorbed into the per-page **admin dock** (ADR-128, Phase 1) → capability-driven modules + in-place editing (ADR-133 / EMBEDDED-ADMIN.md, Phase 2)* |

Every page lands in a template; every feature lands in a widget. Nothing needs a
bespoke layout.

---

## 7. Migration path (incremental, low-risk, Phase 0 to 1 shipped)

> **Update 2026-06-02:** the template migration shipped (PRs #81 to 93, see
> [REDESIGN-INAPP.md](REDESIGN-INAPP.md)). `Index`/`Stream`/`Detail` templates are live;
> `DetailTemplate` is adopted by Circle/Channel/Event (step 4 to 5, in progress, Profile/Programs
> remain). The capability-module/`WidgetSlot` system (steps 1 to 2) is still a future seam, not yet
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
6. Thereafter, **new features are widgets + a config line**: never a new page
   layout.

Order is deliberately additive: each step is shippable on its own and nothing
forces a big-bang rewrite.

---

## 8. The kit today: eight shells + one chrome map (build a page)

> **Update 2026-06-05 (ADR-090):** the template kit is now complete and the
> shell's rail treatment is **declarative**. "Focus" and "Dashboard" are no longer
> informal: they're real templates next to Stream / Index / Detail. A page is now
> *two lines of decision*: pick a template, register a rail.
>
> **Reconciliation (2026-08-05):** earlier prose in this doc said "three", then "eight",
> then "nine". The canonical count today is **eight page shells**, all exported from
> [`@/components/templates`](../components/templates/index.ts) and all on the one
> `PageHeading` grammar: **Stream · Index · Detail · Dashboard · Focus · WizardShell ·
> RailGrid · Admin**. Two of the old nine — `HeaderSidebarTemplate` and
> `TwoColumnTemplate` — were **deleted**: neither was ever composed by a single page in
> `app/` or `components/`, so they were a documented canon with no referent. Their shapes
> survive where they are actually used: the in-body sidebar is `DetailTemplate`'s `sidebar`
> slot, and two peer columns are a grid inside whichever shell the content is (§3).
> `RailGrid` had shipped in the table but was missing from the prose count; it is counted
> now. `PageHeading` and `PageHero` are shared header grammar, not shells, so neither is
> counted; nor are the entity **compositions** in §8.1.1.

### 8.1 The eight shells: `@/components/templates`

| Shell | Import | Use it for | Header / slots |
|---|---|---|---|
| **Stream** | `StreamTemplate` | a flow of items: Feed, Broadcast, a circle discussion | `eyebrow·title·description·action·composer` |
| **Index** | `IndexTemplate` | a collection to browse whose sections are FIXED: Practices, Journeys, Library, Search, Messages, a Space's tabs, Help. (A browse surface whose body an operator rearranges is the **editable index** instead, §8.5) | `title·description·action·toolbar` |
| **Detail** | `DetailTemplate` | one entity: a Circle, Event, Profile, Hub, Program | context band (`badges·actions`) + `tabs` |
| **Dashboard** | `DashboardTemplate` | a metric-led operator/steward workspace: Marketing, CRM, Crew home | `eyebrow·title·description·actions·stats` + sections |
| **Focus** | `FocusTemplate` | a centered, single-task surface: compose/edit forms, Settings, single-conversion + scan-confirm. **Centered body, rail still on** (§8.2) | `eyebrow·title·description·actions·back·width` |
| **WizardShell** | `WizardShell` | a centered **multi-step flow**: onboarding, Space provisioning (`app/onboarding/form.tsx`) | step progress (`WizardProgress`) + body + footer actions |
| **RailGrid** | `RailGrid` | a browse surface pairing a narrow filter/folder rail with a fluid card grid (Loom Studio) — **mobile-first**: the rail is a mini menu on phones (always beside the grid, never stacked above it) and widens on larger screens | `menu` · `children` |
| **Admin** | `AdminTemplate` | the rail-less `/admin/*` workspace under its own two-layer nav | `AdminSection`s |

All eight share **one header grammar** (`PageHeading`): the same type scale, eyebrow,
description, and action slot, so titles read identically everywhere. Detail keeps a
richer context band (identity + badges + tab row) but on the same scale. `AdminTemplate`
is the admin equivalent of Dashboard (a rail-less sibling under `/admin/*`'s own
two-layer nav).

**Body primitives (compose, never re-declare):** `EntityCard`/`PersonCard` (browse
cards), `StatCard` (KPI tile with delta/drill-down), `SectionHeader`, `EmptyState`,
`ModuleCard`/`SidebarCard` (rail/admin panels).

#### 8.1.1 Entity compositions (a shell + one entity's locked shape)

Some entities have a *shape* worth standardising, not just a shell. An entity composition
**wraps** a shell — it never re-declares a header, an `<h1>`, or a divider — and adds the parts the
shell has no opinion about. It is **not** a ninth shell; the count above stays eight.

| Composition | Import | Wraps | Locks |
|---|---|---|---|
| **EventDetail** | `EventDetailTemplate` | `DetailTemplate` | ✅ the standard block layout for every page-like **event** surface (owner directive 2026-07-28) |

`EventDetailTemplate` owns the page frame (`structuredData` · `notices` · `hasActionBar`), the
header lockup it hands to Detail (`cover` · `back` · `title` · `badges` · `actions`), the **ordered**
identity stack (`identity.when → where → cadence → nextDate → seriesRail → belonging → hostedBy →
credit → reward`), and the interior geometry — either the module engine via `interior`, or an
explicit `interiorMain`/`interiorSide` pair rendered through the *same* `main-side` grid classes for
a surface with no module engine (a public route has no `setEventContext` and no `page_settings`
layout row).

🔴 **A surface differs by an ABSENT SLOT, never a fork.** There is no `variant`, no `isPublic`. The
signed-out twin at `/discover/events/[slug]` omits `actions`, `gallery`, `interior` and `actionBar`;
it does not branch inside the template. Consumers: `app/(main)/events/[slug]/page.tsx` (the
photographed page), `app/discover/events/[slug]/page.tsx`, and that route's `loading.tsx` (the
skeleton composes the template, so it cannot drift from the destination's shape again). Enforced by
`components/templates/event-standard-layout.test.ts`; the extraction's byte-identity is pinned by
`event-detail-template.equivalence.test.tsx`. Operator consoles (`/events/[slug]/manage`, `/crm`,
`/settings`, `/edit`) are a different archetype and stay on Dashboard / Studio.

**Form + control primitives (2026-06-06, ADR-147):** `Input`/`Textarea`/`Label` (+
`fieldClasses`/`labelClasses` for a native `<select>`), `Button` (variant × size),
`Dialog` (the shared backdrop · ESC · scroll-lock overlay shell), and `cn()`
(`lib/utils`). Type: use the named scale incl. `text-2xs` (11px) / `text-3xs` (10px).
**Never** `text-[Npx]`; colors are DAWN tokens only (**no** raw palette like
`indigo-600`).

### 8.2 The chrome map: `lib/layout/page-chrome.ts`

Which rail frames a page is **one pure function**, `railFor(pathname)`.

> 🔴 **The rule, and it is short: THE RIGHT RAIL SHOWS ON EVERY MEMBER PAGE.**
> Owner directive 2026-06-20, reaffirmed 2026-07-28. `'global'` is not "the browse
> default" — it is the answer for every surface a member, host, or owner touches,
> **including** compose/edit forms, Settings, message threads, entity owner consoles
> (`/{entity}/[id]/manage`), the Space directory and Space settings, and the Leader
> surface (`/lead/*`). Do not reach for `'none'`/`'scoped'` to fix a crowded page.
> The fix for a doubled-column feeling is to make the page's own interior
> templated/movable, never to remove the site's chrome.

`railFor` returns one of three values:

| Return | Meaning | Where it actually applies today |
|---|---|---|
| `'global'` | the community right rail | **everything not listed below** — the default and the overwhelming majority |
| `'scoped'` | global rail suppressed because an entity-DETAIL subtree renders its **own** scope rail in-body | **nothing.** `SCOPED_PREFIXES` and `SCOPED_PATTERNS` are both empty (see below) |
| `'none'` | no right rail at all | the four full-viewport takeovers, `/admin/*`, and the full-width editors |

**The routes that really are non-`'global'`,** in the order `railFor` tests them:

| # | List in `page-chrome.ts` | Routes | Why |
|---|---|---|---|
| 1 | `DASHBOARD_NONE_PATTERNS` | `/spaces/<slug>/edit-page`, `/spaces/<slug>/marketing`, `/edit/<slug>` | **full-width editors.** Both rails + the page gutters drop so the builder fills the width, but the site header STAYS (owner directive 2026-07: "full page with the main header still showing"). The header-keeping half is `isFullWidthEditor`; this list is only the right-rail half |
| 2 | `/admin` + `/admin/*` (inline branch) | the operator workspace | it mounts its **own** operator info rail on the right, so the member rail is suppressed to avoid double-railing. The global LEFT menu stays |
| 3 | `FULL_TAKEOVER_PREFIXES` | `/on-air`, `/scan`, `/sign-in`, `/print` | genuine **zero-chrome takeovers**: the practice timer, the camera scanner, the auth gate, the print sheet. Not merely "narrow forms" |
| 4 | `FOCUS_NONE_PREFIXES` | *(empty)* | see below |
| 5 | `SCOPED_PREFIXES` / `SCOPED_PATTERNS` | *(both empty)* | see below |

**The two empty lists are a decision, not an oversight.** Leave them empty unless an owner
directive says otherwise:

- **`FOCUS_NONE_PREFIXES` is empty** by the **2026-06-20** directive. A `FocusTemplate`
  page renders a centered, no-side-content **body** — and keeps the global rail beside it.
  "Focus" is a body shape, not a chrome exemption. The list's last entries (the retired
  Growth OS `/apply`, `/apply/<track>`, `/waitlist` flows) are gone; the empty array is
  kept because **the mechanism is the contract** — the next genuine Focus takeover adds
  one prefix here instead of editing the shell.
- **`SCOPED_PATTERNS` is empty** by the **2026-07-28** reversal, and the history is the
  point. The Channel redesign (ADR-885) briefly listed `/channels/<slug>` here, reading
  "give it a right column" as *replacing* the member rail with the Channel's own. The
  owner saw it deployed and corrected course the same night: *"You dropped the right rail
  of the website. Fix that."* The Channel's activity/upcoming/Circles column did not go
  away — it renders **in-body** through `DetailTemplate`'s `sidebar` slot, beside the
  shell rail. Re-add a pattern here only with an explicit owner decision that names the
  route **and** acknowledges it hides the member rail there.
- **`SCOPED_PREFIXES` is empty** for the same reason at subtree scale. `/spaces/*` was
  removed (a Space profile reads as a normal Detail page beside the site's rail; its
  context band is a hero CARD in the content column, so there is no double-rail trap), and
  `/journeys/*` was removed after the v2 rebuild (ADR-252) made the syllabus an in-content
  pane rather than a shell rail. Prefix vs pattern: a prefix matches the route **and
  everything beneath it**, so it only fits when a whole subtree renders an in-body rail —
  which is why the Channel case could never have been a prefix (its `/manage` and `/edit`
  siblings have no rail of their own).

**Two related axes that are NOT the rail** (they never suppress it):

- `railStartsCollapsed` (`MINI_RAIL_PATTERNS`) — the Journey builder/guide/launch surfaces
  keep `'global'` but the rail **starts collapsed** to a thin strip with an expand toggle.
  Collapse is reversible; the rail is always mounted.
- `leftRailFor` — the global member LEFT menu frames every in-app page, `/admin/*`
  included. `LEFT_WORKSPACE_PREFIXES` is empty.

**Operator overrides.** On top of the code map, an operator can reframe a route from
`/admin/page-layout` (`public.page_chrome_overrides`). `(main)/layout.tsx` loads the map once
per request and `app-shell.tsx` resolves `mergeChrome(railFor(pathname), overrides, pathname)`;
`resolvePageChrome` is the async server-side twin. Fail-safe throughout: no override, or a
missing table, falls back to the code default. `MANAGED_ROUTES` is the curated catalog of
surfaces the editor lists.

`app-shell.tsx` shows the global rail iff the resolved rail is `'global'`. **To reframe a
route, edit `page-chrome.ts`, never the shell.** Locked by `lib/layout/page-chrome.test.ts`,
which asserts in so many words that compose/edit/settings/thread surfaces, the Channel detail
page, every `/spaces/*` route, every `/events/*` route, and the entity owner consoles all
return `'global'`.

### 8.3 Build a page: the decision tree

1. **What is the content?** → pick the template from the table above.
2. **Is it a form, a single decision, a settings surface?** → use `FocusTemplate` for the
   centered body. **Do not touch `page-chrome.ts`** — it keeps the global rail like every
   other member page (§8.2). The only routes that drop the rail are the four zero-chrome
   takeovers, `/admin/*`, and the full-width Puck editors, and adding one needs an owner
   decision.
3. **Fill slots with kit primitives.** No hand-rolled `<h1>` headers, no bespoke
   cards, no `text-[10/11px]`, no hardcoded hex.
4. **Don't block the shell.** Server-fetch in the page; push slow/independent
   queries behind per-section `<Suspense>` (§5).

That's the whole contract. A new feature is a template choice + a chrome line, not
a new layout.

> ✅ **The standard (locked, Workstream F / D1=Broad):** *every page composes a kit
> template AND renders its assignable interior sections through `<PageModules>`.* A new
> page is never a hand-rolled `<h1>` + a hand-stacked body. Pick a shell (§8.1), then move
> each interior section to a registered module so an operator can arrange it. The recipe is
> §8.4. Hand-built interior sections are the migration target, not the pattern.

### 8.4 The page → template + `<PageModules>` migration recipe

The repeatable way to move a hand-rolled page onto the framework. Two parts: adopt a
**shell** (the header + chrome), then move each interior **section** to an assignable
**module**. Exemplars to copy from: `/practices` (a full interior of modules) and
`/friends` (one section converted, the rest hand-composed because it reads a search param).

**Part A — adopt a shell (always do this).**

1. **Pick the template** by what the content is (§8.1/§8.3). Browse list → `IndexTemplate`;
   one entity → `DetailTemplate`; a centered form/editor → `FocusTemplate`; etc.
2. **Replace the hand-rolled header** with the template's `PageHeading` slots
   (`title` · `description` · `eyebrow` · `actions` · `back`). Delete every bespoke
   `<h1>`, back-link, and metadata band — there is exactly one page `<h1>`, from the kit.
3. **Leave the rail alone** unless the page is one of §8.2's genuine exceptions. `railFor`
   already answers `'global'` for every member surface; a new page normally needs **no**
   edit to `lib/layout/page-chrome.ts`. Never toggle the rail from the page or the shell.

   *Two pages migrated this way in Batch 1:* `connections/[id]` (inline back-link + card
   header → `DetailTemplate` `back` slot) and `admin/events/[id]` (inline `<h1>` + metadata
   band → `PageHeading` inside its `EventEditorWindow`; `adminBar={false}` because the Studio
   window owns its chrome).

**Part B — move each interior section to a module (the `<PageModules>` part).** Do this for
every section that is a self-contained, self-fetching block. For each one:

1. **Write the module component** under `components/widgets/<group>/<id>.tsx` — an async
   Server Component that **fetches its own data** and **returns `null` when it has nothing**
   (the module contract; §4.1). Reuse an existing component by wrapping it (e.g.
   `components/widgets/friends/friends-impact.tsx` wraps `connections/your-impact.tsx`).
2. **Add its metadata** to `lib/widgets/modules.ts` `LAYOUT_MODULES` — `{ id, label,
   description }`, the operator-facing name. (Metadata only; no React here.)
3. **Bind the component** in `lib/widgets/registry.tsx` — one line in `COMPONENTS`
   mapping the id to its RSC.
4. **Add the route's module SET** to `ROUTE_MODULE_IDS` in `modules.ts` — `'/route':
   [...ids]` in default render order (an unsaved layout renders them in this order in the
   `main` slot). Section-shared layouts key at `'/seg/*'`.
5. **List the route** in `lib/widgets/module-routes.ts` `MODULE_ROUTES` so the on-page
   **Layout** editor (Settings ▾ → Page → Layout) appears there and offers exactly this set.
6. **Render it on the page:** replace the hand-stacked section(s) with
   `<PageModules route="/route" />`. Keep a section hand-composed ONLY when it depends on a
   page prop a nested module can't get (a `searchParams` facet) — surface that via the
   request header seam (`x-search`, as `/practices` does) or leave it in the page (as
   `/friends` keeps its `mode`-dependent buckets).

   *Exemplar in Batch 1:* `/friends` — the "Your impact" section became the `friends-impact`
   module (`components/widgets/friends/friends-impact.tsx`, meta in `modules.ts`, bound in
   `registry.tsx`, set `FRIENDS_MODULE_IDS` in `ROUTE_MODULE_IDS`, route in
   `module-routes.ts`), and the page renders it via `<PageModules route="/friends" />`. The
   `mode`-dependent request/orbit/intro lists stay hand-composed.

**Long-tail progress (the converted pages, newest first):**

- ✅ **Batch 3 (2026-06-20):** two more member surfaces converted; one shell-only fix; two skips.
  - `/programs` → *(removed 2026-07, ADR-597 — the Programs feature is retired; this bullet is kept for
    historical context only.)* The open browse list (the framework library + the viewer's completion)
    was the `programs-list` module, keyed only on the viewer, no searchParams facet.
  - `/crew/challenges` → the season KPI band + the challenges-by-difficulty grid are one
    `challenges-season` module (`components/widgets/challenges/challenges-season.tsx`): both views
    derive from one viewer-scoped fetch, so they stay one block rather than a double-fetch. Reads the
    challenge rows directly (not the redirecting `getChallengesData`) so it degrades to `null`; the
    page keeps its own auth guard.
  - `/programs/<slug>` → *(removed 2026-07, ADR-597.)* Was shell-only (Part A): the hand-rolled
    back-link became the `DetailTemplate` `back` slot; the prose body stayed hand-composed.
  - **`/broadcast` (the index) stays hand-composed:** its interior is one cohesive, viewer-scoped
    dashboard from a single fetch — the hero and at-a-glance line are derived from the SAME
    dispatch/event arrays as the main feed and the sidebar, not independent sections — and its
    two-column `main`/`side` visual cannot be preserved under the default `single` template (which
    stacks every module in `main`). Like `/library`, it is a single coupled view, not a stack of
    standalone blocks.
  - **`/entry-points` is skipped:** it is a Crew-gated Focus builder (the interactive
    `EntryPointsManager` client manager with a paid-gate early return), not a stack of standalone
    self-fetching sections (the "Focus editor" skip in this batch's rules).
- ✅ **Batch 2 (2026-06-20):** three more member surfaces converted.
  - `/crew/leaderboard` → the **Consistency** layer (daily practice streak + weekly rhythms) is now
    the `leaderboard-consistency` module (`components/widgets/leaderboard/leaderboard-consistency.tsx`).
    The collective goal, the viewer's standing band, and the individual board **stay hand-composed**:
    each reads the `scope`/`track` `searchParams` a nested module never receives (the `/friends`
    `mode` pattern).
  - `/journal` → the whole interior (captured moments grouped by day, including the first-capture
    empty) is the `journal-entries` module (`components/widgets/journal/journal-entries.tsx`).
  - `/library/review` → the Host-gated approval queue is the `library-review-queue` module
    (`components/widgets/library/library-review-queue.tsx`); returns `null` below Host, so the page's
    redirect stays the real gate. **`/library` (the index) stays hand-composed:** its interior is one
    faceted, `type`/`pillar` `searchParams`-driven grid (no `x-search` seam), not a stack of standalone
    sections.
- ✅ **Batch 1 (2026-06-19):** `connections/[id]`, `admin/events/[id]` (shell only); `/friends`
  (`friends-impact`, the exemplar above).

**Gate:** `pnpm tsc --noEmit && pnpm lint && pnpm test`. `lib/widgets/modules.test.ts` locks
that every id in every route set has metadata and that sets don't leak across routes, so a
half-wired module fails there.

---

## 8.5 The standard page (header + admin settings)

> **Update 2026-06-26 (ADR-411):** the standardized page header is now **first-class
> template props**, not a per-page hand-roll (it had drifted into ~4 near-identical copies).
> The canonical lockup, proven across Circles, Events, Practices, and Journeys, is
> **breadcrumb -> cropped hero image -> title**, with an optional in-place admin **Settings**
> surface. Compose the props; don't re-author the lockup.

### The standard Index header: `trail` + `heroImage`

[`IndexTemplate`](../components/templates/index-template.tsx) carries the whole lockup:

| Prop | Type | Renders |
|---|---|---|
| `trail` | `Crumb[]` (`{ href, label }`, exported from the file) | a `<Breadcrumbs>` at the very top of the header |
| `heroImage` | `string \| null` | the STANDARD cropped header banner (`h-44 ... object-cover sm:h-56`, rounded, bordered). Renders **only when set** |
| `banner` | `React.ReactNode` | the **escape hatch** for a bespoke header node (rendered after `trail` + `heroImage`). Prefer `trail` + `heroImage`; reach for `banner` only for the rare custom header |
| `heroOverlay` | `boolean` | the **overlay Hero Header** (the Business Spaces grammar, #1639): the eyebrow / title / description / action render ON the `heroImage` over an ink legibility scrim, instead of the banner-above-heading lockup. Only applies when `heroImage` is set; the admin-bar rule still draws below. |

A standard index is therefore `trail={[...]}` + `heroImage={url}` + `title`, no hand-built
banner. Exemplars **that really compose `IndexTemplate` today** (verified 2026-08-05):
[`practices/page.tsx`](<../app/(main)/practices/page.tsx>),
[`journeys/page.tsx`](<../app/(main)/journeys/page.tsx>),
[`library/page.tsx`](<../app/(main)/library/page.tsx>),
[`events/calendar/page.tsx`](<../app/(main)/events/calendar/page.tsx>).
*(Circles and Events used to head this list. They no longer import `IndexTemplate` at all —
they moved to the **editable index** below. Same hero, different body.)*

**Overlay Hero Header (`heroOverlay`):** the uniform Business-Spaces hero band — a cover image
with the title, subtitle, and the page's own action buttons overlaid on an ink scrim. Adopters:
[`practices/page.tsx`](<../app/(main)/practices/page.tsx>),
[`library/page.tsx`](<../app/(main)/library/page.tsx>),
[`journeys/page.tsx`](<../app/(main)/journeys/page.tsx>) (`journeys/mine` and `network` also
pass `heroOverlay`, without a hero image). Each keeps its own title/description +
buttons; a section default image (under `public/images/site/`) keeps the band present when the
operator has set none. Secondary buttons that ride the scrim use on-ink styling
(`border-white/30 bg-white/10 text-on-ink`); primary create buttons stay `bg-primary`.
Under the hood `heroOverlay` renders the canonical
[`PageHero`](../components/templates/page-hero.tsx) — the same component the editable index
reaches for directly, which is why the two compositions look identical in the band.

### The editable index: `MarketHero` + an operator-rearrangeable body

> **Sanctioned composition (owner decision, documented 2026-08-05).** This is **not** drift and
> it is **not** a ninth shell. It is the browse-page answer for a surface whose **body** an
> operator must be able to rearrange — something `IndexTemplate`'s fixed slots
> (`toolbar` → `children`) structurally cannot offer.

Eight major browse surfaces were deliberately migrated **off** `IndexTemplate` onto it
(verified against the code, 2026-08-05):

| Route | Header | Body |
|---|---|---|
| `/circles` | `MarketHero` | `BlockRender` — the published Puck doc for `circles`, falling back to the coded template, fed live data via `metadata={{ circlesIndex }}` |
| `/channels` | `MarketHero` | `PageModules route="/channels"` — the module engine (§4) |
| `/events` | `MarketHero` (via `components/marketplace/events-surface.tsx`) | the shared events surface + facets |
| `/spaces/directory` | `MarketHero` | the shared directory body (`components/spaces/directory-view`) |
| `/classifieds` | `MarketHero` | faceted marketplace grid |
| `/housing` | `MarketHero` | faceted marketplace grid |
| `/market` | `MarketHero` | faceted marketplace grid |
| `/store` | `MarketHero` | faceted marketplace grid |

Two things make this a **body-composition choice and nothing more**:

1. **The header is the same canonical component.**
   [`MarketHero`](../components/marketplace/market-hero.tsx) is a *thin wrapper over*
   [`PageHero`](../components/templates/page-hero.tsx) — its own file comment says so. It
   forwards `coverImage` / `eyebrow` / `title` / `subtitle` / `search` / `actions` / `variant`
   / `size` / `overlay` and adds nothing else. `IndexTemplate`'s `heroOverlay` branch renders
   that **same** `PageHero`. So both paths emit one `<h1>` from the kit, both are
   token-clean and theme correctly, and `scripts/check-headers.mjs` is satisfied by both.
2. **The rail is untouched.** Every route above returns `'global'` from `railFor` (§8.2).
   Moving off `IndexTemplate` bought an editable body; it bought **no** chrome exemption and
   **no** theming exemption.

**Which one do I reach for?**

| Reach for… | When |
|---|---|
| **`IndexTemplate`** | the page's sections are FIXED and code-owned: a facet grid keyed on `searchParams`, a Space tab, a search results page, an operator list. Default choice — it is fewer moving parts |
| **The editable index** | an operator must be able to reorder / hide / add sections of the body without a deploy, and the surface is important enough to hand them (a top-level community or commerce index) |

Both carry the operator **Settings** affordance: `IndexTemplate` draws `PageAdminBar`
itself, and an editable-index page re-adds it explicitly as `<PageAdminBar asDivider />`
under the hero — that is exactly what the "the on-page operator Settings affordance
`IndexTemplate` used to draw" comments in those pages are for. Losing it is a bug, not a
style choice.

Both also resolve their header the same operator-tunable way: `resolveHeaderElement`
(ADR-793) supplies `layout` / `height` / `scrim`, so an operator retunes the band without a
code change on either path.

> **Where the hero comes from:** the page resolves its hero URL from the Settings header
> image (`getPageHeaderImage`, [`lib/page-settings/store.ts`](../lib/page-settings/store.ts))
> and/or the page-content hero (`resolvePageContent` `heroImage`), then passes the resolved
> string to `heroImage`.

### The standard Detail cover: `coverImage`

[`DetailTemplate`](../components/templates/detail-template.tsx) gains the symmetric twin:

| Prop | Type | Renders |
|---|---|---|
| `coverImage` | `string` | the standard cropped **16:6** cover at the top of the header |
| `coverImage` | `null` (explicit) | a neutral gradient placeholder (`from-primary-bg via-surface-elevated to-signal-bg` + an `ImageIcon`) |
| `coverImage` | omitted | no cover (existing pages unchanged) |
| `hero` | `React.ReactNode` | the **escape hatch**: a fully custom cover node. When set, `coverImage` is **ignored** (e.g. the event detail page's date-based fallback) |

### The admin-settings scope kit (9 touch-points)

The repeatable recipe to give a new entity an in-place **Settings** module with cover-image
editing (run for Circles, Events, and Practices). Copy the exemplar pair:
[`components/admin/modules/practice-settings-module.tsx`](../components/admin/modules/practice-settings-module.tsx)
+ [`app/(main)/practices/admin-actions.ts`](<../app/(main)/practices/admin-actions.ts>).
Every server action **re-checks the capability server-side** (the dock's role gate is UX
only; the action is the authority, since the admin client bypasses RLS).

| # | File | Add |
|---|---|---|
| 1 | [`lib/core/capabilities.ts`](../lib/core/capabilities.ts) | `'<entity>.editSettings'` to the `Capability` union, a `{ kind: '<entity>'; ... ownerId/hostId; viewerManagesScope? }` `Scope` variant, and a `case '<entity>'` in `resolveCapabilities` (grant to owner/host, platform staff, or a parent-scope manager) |
| 2 | [`lib/core/load-capabilities.ts`](../lib/core/load-capabilities.ts) | `get<Entity>Capabilities(id)` (fetch the owner column, call `resolveCapabilities`) |
| 3 | [`lib/admin/modules/registry.ts`](../lib/admin/modules/registry.ts) | an `<entity>.settings` entry in `ADMIN_MODULES` (`scopes: ['<entity>']`, `requiredCapability`, `surface: 'sidebar'`) |
| 4 | [`components/admin/modules/module-map.tsx`](../components/admin/modules/module-map.tsx) | bind `'<entity>.settings'` -> the new module component |
| 5 | [`components/layout/settings-drawer.tsx`](../components/layout/settings-drawer.tsx) | `{ prefix: /^\/<entities>\/[^/]+/, kind: '<entity>' }` to `PATH_SCOPE_KINDS` (the existing registry render path then shows the module; no new branch) |
| 6 | [`app/(main)/<entities>/admin-actions.ts`](<../app/(main)/practices/admin-actions.ts>) | `get<Entity>AdminData`, `update<Entity>Settings`, `upload<Entity>Cover`/`remove<Entity>Cover` (mirror `uploadCircleCover`: `site-media` bucket storing a URL, OR the event pattern: `event-media` bucket storing a PATH, match the entity's existing cover column), `update<Entity>Permalink` |
| 7 | [`components/admin/modules/<entity>-settings-module.tsx`](../components/admin/modules/practice-settings-module.tsx) | the flush 2/3 + 1/3 grid with `InlineCover` + identity fields (mirror `practice-settings-module.tsx`) |
| 8 | [`components/<entities>/edit-<entity>-button.tsx`](../components/practices/edit-practice-button.tsx) | dispatches the `'open-settings'` window event, placed in the `DetailTemplate` `actions` slot, capability-gated |
| 9 | The index page | passes `trail` + `heroImage` (the standard header above) |

---

## 9. The Studio: the shared *creation* surface (ADR-142)

Pages are for *reading*; the **Studio** is the one window for *making*. Anywhere
there's something to create or edit (a journey today; circles, practices, events
next), the same launchable window opens, so authoring feels identical everywhere,
the way the five templates make reading feel identical.

- **Shell:** `components/studio/studio-window.tsx`, an overlay panel (full-screen on
  mobile) with shared chrome (eyebrow, Esc/backdrop close, scroll-lock), a body the
  entity fills with its tools, and a sticky footer action bar. Launchable in place
  **and** deep-linkable (the full builder also lives at the entity's route).
- **Per-entity builder = the extension point.** The shell is generic; each entity
  supplies its identity header, tool components, and footer, plus its create/edit
  **capability gating** for that instance. First instance:
  `components/studio/journey/*` (emoji/accent identity, markdown intro, drag-reorder
  path, per-step cadence/note, live Pillar balance, autosave, share-to-library).
- **Build the next entity** by mounting `<StudioWindow>` with that entity's tools:
  don't author a new editor. Accents come from `lib/studio/accents.ts` (token-based,
  never hex).

## 10. Two page builders: the boundary (never cross them)

There are exactly **two** page-building systems, for two different surfaces. They look
alike (both "edit a page") but they are not interchangeable; choosing the wrong one is
how a published draft shadows a coded experience, or an in-app page loses its chrome.

| | **Puck page editor** | **Module engine** |
|---|---|---|
| What it builds | The **public, brandable micro-site** block tree (per-Space landing / marketing pages) | **Authenticated in-app pages** (a template shell + assignable widgets) |
| Surface | Public marketing routes (`app/(marketing)/*`), and later a Space's own custom-domain micro-site | App routes behind auth (`app/(main)/*`) |
| Store / render | `public.pages` (`data` draft / `published_data` live) → `getPublishedData(slug)`; editor at `app/edit/[slug]` + `components/page-editor/*` | `public.page_settings` (layout / SEO / status) → a template + `<PageModules route>` (`lib/page-settings/*`) |
| Composes | The Puck block library (`components/page-editor/blocks/*`) | The five templates + `components/ui/*` / `cards/*` + widgets (this doc, §3 to §4) |

**The rule:**

- **Never offer the Puck editor on an authenticated app route.** In-app pages are a
  template plus `<PageModules>`; their layout/SEO/visibility is the module engine's job.
- **Never offer the module editor on a public micro-site.** Public marketing/landing
  pages are a Puck block tree.
- **Both are space-aware via `space_id`.** `public.pages` and `public.page_settings` each
  carry a nullable `space_id` (backfilled to the root space; the canary holds, root
  resolves exactly as today). Reads/writes default to the root space via `loadRootSpaceId`,
  so single-tenant behavior is unchanged.
- **Today the Puck editor is still gated** to the 4-slug `isEditableSlug` allowlist
  (`lib/page-editor/data.ts`); the `space_id` seam only makes the *storage* per-Space-ready.
  Un-gating to full per-Space authoring (offering Puck on a Space's own slugs) is **Phase 5
  white-label**, not now.

---

## Decisions captured

- **One shell, EIGHT page shells (Stream / Index / Detail / Dashboard / Focus /
  WizardShell / RailGrid / Admin)**, all on one `PageHeading` grammar; the rail is a
  declarative `page-chrome.ts` map, not shell-baked conditionals (ADR-090). See §8.1
  for the full canon + the count reconciliation (`HeaderSidebarTemplate` and
  `TwoColumnTemplate` were deleted 2026-08-05 with zero usages).
- **The right rail shows on EVERY member page** (owner directive 2026-06-20,
  reaffirmed 2026-07-28). `FOCUS_NONE_PREFIXES`, `SCOPED_PREFIXES`, and
  `SCOPED_PATTERNS` are deliberately empty; only the zero-chrome takeovers,
  `/admin/*`, and the full-width editors drop it (§8.2).
- **The editable index is a sanctioned composition** (`MarketHero` + `BlockRender` /
  `PageModules`) for a browse surface whose body an operator rearranges. Same
  canonical `PageHero`, same global rail — a body choice, not an exemption (§8.5).
- **Features are widgets**: self-fetching Server Components, scope-aware,
  gate-aware, returning null when empty, wrapped in a uniform `WidgetCard`.
- **Assignment is one declarative config**; pages only render `<WidgetSlot>`.
- **Speed is structural**: RSC + per-widget Suspense + parallel fetch + nested
  layouts + dimension-matched skeletons; client JS only at interactive leaves.
- **Gating (role + milestone, IA-STRATEGY §2) is widget metadata**: the same
  mechanism powers the "wake up" progressive reveal.
