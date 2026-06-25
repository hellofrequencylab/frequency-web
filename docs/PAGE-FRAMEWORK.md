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

### Template D: **Header / Page / Sidebar** (`HeaderSidebarTemplate`)
Title band over a wide main column beside a narrower **in-body sidebar** (filters,
a summary card, related links, a table of contents).
- **Use:** a page with one primary flow AND a persistent secondary panel that
  belongs in-body (not in the shell rail).
- **Slots:** `sidebar` (+ `sidebarSide` left/right), the main `children`.
- **Rail note:** a page with its own in-body sidebar should usually register as
  `'scoped'` in `page-chrome.ts` so the global rail is suppressed (no double-rail).

### Template E: **Header / 2 Column** (`TwoColumnTemplate`)
Title band over **two equal columns** of comparable weight (e.g. "yours" vs "the
community", a form beside a live preview, two related lists).
- **Use:** two peer areas where neither column is subordinate (unlike Template D).
- **Slots:** `left`, `right` (stack on mobile, split evenly from `md`).

> **Update (§8, ADR-090):** Focus and Dashboard are now **real templates** too:
> `FocusTemplate` (the no-rail compose/edit/settings surface, formerly just "the
> shell hiding the rail") and `DashboardTemplate` (the metric-led operator
> workspace). With **`HeaderSidebarTemplate`** (Header/Page/Sidebar),
> **`TwoColumnTemplate`** (Header/2 Column), **`WizardShell`** (the multi-step
> flow shell), and **`AdminTemplate`** (the `/admin/*` workspace), the kit is now
> **nine shells**, all sharing one `PageHeading`. See §8 for the full kit + the
> declarative rail map (`lib/layout/page-chrome.ts`).

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
> sidebar · Header + 2 columns) that arrange modules WITHIN a page's body. This doc calls the latter
> **"interior layouts/grids"** in prose to avoid the collision; the code identifiers
> (`templates.ts` / `TemplateId` / `TEMPLATES`) are unchanged.
>
> | Concern | Where | Note |
> |---|---|---|
> | **Module catalog** (metadata only) | [`lib/widgets/modules.ts`](../lib/widgets/modules.ts) | `LAYOUT_MODULES` / `moduleMeta` (union of every block) + **route scoping** (ADR-294): `ROUTE_MODULE_IDS` / `moduleIdsForScope` map a scope key → the ids that page offers, so a page only shows/renders ITS OWN blocks, no React, so the editor / actions / resolver never import RSCs |
> | **Interior layouts/grids** (metadata only, ADR-272) | [`lib/widgets/templates.ts`](../lib/widgets/templates.ts) | `TEMPLATES` / `templateMeta` / `slotIds` / `defaultSlotId`: 6 interior layouts/grids (Single · Main + side · 2 columns · 3 columns · Header + sidebar · Header + 2 columns) naming their slots; no React, like the module catalog. Distinct from the OUTER page shells in `@/components/templates` (§8). Add an interior layout = one entry here + a grid case in `page-modules.tsx` |
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

## 8. The kit today: nine shells + one chrome map (build a page)

> **Update 2026-06-05 (ADR-090):** the template kit is now complete and the
> shell's rail treatment is **declarative**. "Focus" and "Dashboard" are no longer
> informal: they're real templates next to Stream / Index / Detail. A page is now
> *two lines of decision*: pick a template, register a rail.
>
> **Reconciliation (Phase 0.5.11):** earlier prose in this doc said "three", then
> "eight". The canonical count today is **nine page shells**, all exported from
> [`@/components/templates`](../components/templates/index.ts) and all on the one
> `PageHeading` grammar: **Stream · Index · Detail · Dashboard · Focus · WizardShell ·
> HeaderSidebar · TwoColumn · Admin**. (`WizardShell` is the multi-step provisioning/
> onboarding flow shell, e.g. `app/onboarding/form.tsx`, and was the one missing from
> the canon; it is now listed below.) `PageHeading` itself is the shared header grammar,
> not a shell, so it is not counted.

### 8.1 The nine shells: `@/components/templates`

| Shell | Import | Use it for | Header / slots |
|---|---|---|---|
| **Stream** | `StreamTemplate` | a flow of items: Feed, Broadcast, a circle discussion | `eyebrow·title·description·action·composer` |
| **Index** | `IndexTemplate` | a collection to browse: Circles, Channels, Events, People, Search | `title·description·action·toolbar` |
| **Detail** | `DetailTemplate` | one entity: a Circle, Event, Profile, Hub, Program | context band (`badges·actions`) + `tabs` |
| **Dashboard** | `DashboardTemplate` | a metric-led operator/steward workspace: Marketing, CRM, Crew home | `eyebrow·title·description·actions·stats` + sections |
| **Focus** | `FocusTemplate` | a centered, no-rail surface: compose/edit forms, Settings, single-conversion + scan-confirm | `eyebrow·title·description·actions·back·width` |
| **WizardShell** | `WizardShell` | a centered, no-rail **multi-step flow**: onboarding, Space provisioning (`app/onboarding/form.tsx`) | step progress (`WizardProgress`) + body + footer actions |
| **HeaderSidebar** | `HeaderSidebarTemplate` | one primary flow beside a persistent in-body secondary panel (§3 Template D) | `sidebar` (+ `sidebarSide`) + `children` |
| **TwoColumn** | `TwoColumnTemplate` | two peer columns of comparable weight (§3 Template E) | `left` · `right` |
| **Admin** | `AdminTemplate` | the rail-less `/admin/*` workspace under its own two-layer nav | `AdminSection`s |

All nine share **one header grammar** (`PageHeading`): the same type scale, eyebrow,
description, and action slot, so titles read identically everywhere. Detail keeps a
richer context band (identity + badges + tab row) but on the same scale. `AdminTemplate`
is the admin equivalent of Dashboard (a rail-less sibling under `/admin/*`'s own
two-layer nav).

**Body primitives (compose, never re-declare):** `EntityCard`/`PersonCard` (browse
cards), `StatCard` (KPI tile with delta/drill-down), `SectionHeader`, `EmptyState`,
`ModuleCard`/`SidebarCard` (rail/admin panels).

**Form + control primitives (2026-06-06, ADR-147):** `Input`/`Textarea`/`Label` (+
`fieldClasses`/`labelClasses` for a native `<select>`), `Button` (variant × size),
`Dialog` (the shared backdrop · ESC · scroll-lock overlay shell), and `cn()`
(`lib/utils`). Type: use the named scale incl. `text-2xs` (11px) / `text-3xs` (10px).
**Never** `text-[Npx]`; colors are DAWN tokens only (**no** raw palette like
`indigo-600`).

### 8.2 The chrome map: `lib/layout/page-chrome.ts`

Which rail frames a page is **one pure function**, `railFor(pathname)`, returning:

- `'global'`: the community right rail (browse / stream / dashboard default).
- `'scoped'`: global rail suppressed; the **Detail** page renders its own scope
  rail in-body (no double-rail trap). Sections: `/circles/*`, `/channels/*`.
- `'none'`: **Focus**: no rail. Compose/edit (`/events/new`,
  `/practices/*/edit`, `/connections/*`), settings, message threads, and the
  operator/steward workspaces (`/marketing`, `/crm`, `/outreach`, `/codes`,
  `/upgrade`, `/g/*`, `/n/*`).

`app-shell.tsx` shows the global rail iff `railFor(pathname) === 'global'`. **To
reframe a route, edit `page-chrome.ts`, never the shell.** Locked by
`page-chrome.test.ts`.

### 8.3 Build a page: the decision tree

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
3. **Register the rail** in `lib/layout/page-chrome.ts` (`'global'`/`'scoped'`/`'none'`).
   Never toggle the rail from the page or the shell.

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
  - `/programs` → the open browse list (the framework library + the viewer's completion, including the
    "coming soon" empty) is the `programs-list` module
    (`components/widgets/programs/programs-list.tsx`). Keyed only on the viewer, no searchParams facet.
  - `/crew/challenges` → the season KPI band + the challenges-by-difficulty grid are one
    `challenges-season` module (`components/widgets/challenges/challenges-season.tsx`): both views
    derive from one viewer-scoped fetch, so they stay one block rather than a double-fetch. Reads the
    challenge rows directly (not the redirecting `getChallengesData`) so it degrades to `null`; the
    page keeps its own auth guard.
  - `/programs/<slug>` → **shell only** (Part A): the hand-rolled back-link became the `DetailTemplate`
    `back` slot. The body is one prose blob keyed on the `slug` route param (not standalone stacked
    sections), so it stays hand-composed.
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

- **One shell, NINE page shells (Stream / Index / Detail / Dashboard / Focus /
  WizardShell / HeaderSidebar / TwoColumn / Admin)**, all on one `PageHeading`
  grammar; the rail is a declarative `page-chrome.ts` map, not shell-baked
  conditionals (ADR-090). See §8.1 for the full canon + the count reconciliation.
- **Features are widgets**: self-fetching Server Components, scope-aware,
  gate-aware, returning null when empty, wrapped in a uniform `WidgetCard`.
- **Assignment is one declarative config**; pages only render `<WidgetSlot>`.
- **Speed is structural**: RSC + per-widget Suspense + parallel fetch + nested
  layouts + dimension-matched skeletons; client JS only at interactive leaves.
- **Gating (role + milestone, IA-STRATEGY §2) is widget metadata**: the same
  mechanism powers the "wake up" progressive reveal.
