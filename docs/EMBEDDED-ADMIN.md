# Embedded Admin — Phase 2: capability-driven modules + in-place editing

> **The answer first:** Phase 1 already shipped — the **`PageAdminDock`** (ADR-128):
> an edge-tab (desktop) / header-Shield (mobile) slide-out that gives operators
> per-page admin actions *on the page they govern*, in push or overlay mode, resizable
> and persisted. This doc is **Phase 2**: the *content engine* inside that dock. It
> replaces the dock's fixed, role-branched action list with a **capability-driven
> `AdminModule` registry**, turns today's `/admin/*` deep-links and the "Soon"
> layout/style items into **in-place editing**, and **absorbs `/admin/*`** progressively
> into the page. Tiers stay automatic — *same box format, more boxes*.
>
> Decision: [ADR-133](DECISIONS.md). Builds on [ADR-128](DECISIONS.md) (PageAdminDock
> Phase 1) and [ADR-127](DECISIONS.md) (operations roles). Uses the capability resolver
> (`lib/core/capabilities.ts`) + the operations-role capability map (`lib/core/staff-roles.ts`,
> `lib/staff.ts` `staffCan`). Refines [CAPABILITIES-AND-MOBILE.md §2](CAPABILITIES-AND-MOBILE.md)
> and [PAGE-FRAMEWORK.md §3/§6](PAGE-FRAMEWORK.md).
>
> **Status:** ✅ Phase 1 shipped (the dock) · ⏳ Phase 2 build pending (this doc).
>
> **Update — [ADR-137](DECISIONS.md):** the in-place modules are organized into a
> drill-down **settings console** with a universal **9-category spine** (next section).
> On-page **Edit Mode** becomes the way *all* entity admin happens — `/admin/*` entity
> surfaces go away entirely.

---

## The target shape — Edit Mode & the 9-category settings console

> Decision: [ADR-137](DECISIONS.md). The end state: **no entity admin lives in
> `/admin/*`** — every page has an **Edit Mode** that opens a settings console covering
> the *whole* surface, organized by one consistent spine.

**The move.** An **Edit** toggle on any page the viewer can administer does two things at
once: (1) the page enters **edit mode** — inline click-to-edit handles light up on the
obvious things (title, cover, snippet); and (2) the **settings console** (the dock)
slides out with the *entire* suite for that page — not a flat list, but a **drill-down**
grouped by a fixed category spine. You never leave the page: "Manage → go to admin"
becomes "Edit → console, right here."

### The spine — settings as *questions* (one taxonomy, every page)

The trick that makes one format fit every page: every setting answers one of a fixed,
ordered set of questions. That question-set is the **spine** — universal and memorable;
a page only shows the categories that apply.

| # | Category | The question | Holds | `slot` |
|---|---|---|---|---|
| 1 | **Basics** | *What is it?* | name/title, snippet (about), type, status, cover image, parent links (channel/hub) | `basics` |
| 2 | **Place & Time** | *Where & when?* | city/neighborhood, map pin (lat/long), timezone, online/in-person; events add schedule + recurrence | `place` |
| 3 | **People** | *Who's in it?* | host/owner, members, roles & access, capacity, invites, who-can-post/join | `people` |
| 4 | **Layout** | *What shows on the page?* | which modules/widgets appear + order, pinned items, tabs, about sections — the page-builder (the dock's "Soon" Layout/Styles) | `layout` |
| 5 | **Engage** | *What do they do & earn?* | practices, achievements, challenges, rewards/zaps, crew tasks, leaderboard | `engage` |
| 6 | **Reach** | *How do people find it?* | QR code(s), invite/share links, campaigns + UTM, dynamic links | `reach` |
| 7 | **Comms** | *How do you reach them?* | broadcasts/announcements, notification rules | `comms` |
| 8 | **Safety** | *How do you keep it healthy?* | moderation queue, blocks, content rules, Vera/AI behavior here | `safety` |
| 9 | **Insights** | *How's it doing?* | read-only stats for this entity (a view, not an edit) | `insights` |
| — | **Danger** | *End it?* | archive, delete, transfer ownership — always pinned last | `danger` |

This refines the registry's `AdminSlot` union into the spine above: `AdminModule.slot`
becomes the **category**, and the console renders `modulesFor(scope, caps)` grouped by it.

### One spine, every page (coverage matrix)

Each page lights up a subset — same order, same look (● shown · ○ n/a):

| Page | Basics | Place&Time | People | Layout | Engage | Reach | Comms | Safety | Insights | Danger |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Circle** | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| **Event** | ● | ● | ● | ○ | ● | ● | ● | ○ | ● | ● |
| **Channel** | ● | ○ | ● | ● | ○ | ● | ● | ● | ● | ● |
| **Hub / Nexus** | ● | ● | ● | ○ | ○ | ● | ● | ○ | ● | ● |
| **Profile** | ● | ● | ○ | ● | ● | ● | ○ | ○ | ● | ● |
| **Feed / Broadcast** | ○ | ○ | ○ | ● | ○ | ○ | ● | ● | ● | ○ |
| **Platform (home/global)** | ○ | ○ | ● | ● | ● | ● | ● | ● | ● | ● |

The **Platform** row is how `/admin`'s leftovers (Members, Roles, AI, Vera) come home —
they're the **global scope's** console, opened from the home page's Edit button.

### Worked example — a Circle's full suite

`✓` = column already exists on the `circles` table · `＋` = new:

| Category | Circle settings |
|---|---|
| **Basics** | ✓ Name · ✓ Snippet (`about`) · ✓ Type · ✓ Status · ✓ Cover (`image_url`) · ✓ Linked channel (`topical_channel_id`) / hub |
| **Place & Time** | ✓ City · ✓ Neighborhood · ✓ Map pin (`latitude`/`longitude`) · ✓ Timezone · ＋ default meeting spot |
| **People** | ✓ Host · ✓ Capacity (`member_cap`) · members list · roles · ＋ invite links · ＋ who-can-post |
| **Layout** | ＋ which rail modules show · ＋ pinned post · ＋ tab order · ＋ featured practice |
| **Engage** | ＋ this circle's achievements/challenges · ＋ crew tasks · ＋ leaderboard on/off · ✓ practice |
| **Reach** | ＋ circle check-in QR · ＋ invite QR · ＋ campaign/UTM · ＋ dynamic link |
| **Comms** | ＋ broadcast to circle · ＋ announcement · ＋ notification defaults |
| **Safety** | ＋ reports in this circle · ＋ blocklist · ＋ Vera tone |
| **Insights** | ＋ members/active/retention · ＋ scan + RSVP stats (read-only) |
| **Danger** | ＋ archive · ＋ transfer host · ＋ delete |

Today's shipped `circle.settings` module is only the top of **Basics** — the rest of this
table is the headroom the console unlocks.

### The console format — a drill-down

A narrow panel can't show the whole suite at once, so the console is **iOS-Settings-style
drill-down** (scales to any suite size, stays compact):

```
EDIT MODE — console home ─────────────────╮      DRILL INTO "Place & Time" ───────────╮
┌─ Encinitas Morning Ride · Editing   ✕ ┐ │      ┌─ ‹ Place & Time            ✕ ┐      │
│ [ 🔍 Search settings…             ]   │ │      │ ┌ City ───────────────────┐  │      │
│ ◉ Status: Active           ▾ (quick) │ │      │ │ [ Encinitas ]           │  │      │
│ ───────────────────────────────────  │ │      │ └─────────────────────────┘  │      │
│ ◔ Basics           Name, snippet…  › │ │      │ ┌ Map pin ────────────────┐  │      │
│ 📍 Place & Time    Encinitas · PT   › │ ┼────► │ │ [ 33.04, -117.29 ]      │  │      │
│ 👥 People          Host, 12 members › │ │      │ └─────────────────────────┘  │      │
│ ▦ Layout           6 modules        › │ │      │ ┌ Timezone ───────────────┐  │      │
│ 🎯 Engage          3 challenges     › │ │      │ │ [ America/Los_Angeles ▾]│  │      │
│ 📣 Reach           QR · 2 links     › │ │      │ │           [ Save ] Cancel│  │      │
│ 🛡 Safety           0 open reports   › │ │      │ └─────────────────────────┘  │      │
│ 📊 Insights        (view)           › │ │      └───────────────────────────────┘      │
│ ⚠ Danger           Archive, delete  › │ │        back ‹ returns to console home        │
└───────────────────────────────────────┘ │
```

- **Console home** = the category list (icon · name · live summary · ›), plus a couple of
  **quick toggles** (status) flippable without drilling.
- **Tap a category** → its screen of `AdminModuleCard`s, each with inline save. **Back** ‹
  returns home. **Search** jumps to any setting.
- **Inline + panel:** edit mode also adds click-to-edit handles on the page for the
  obvious fields; the console holds the full set (the "panel + light inline" decision).
- **"Done editing"** exits edit mode everywhere at once.

### How it grows what's shipped (a delta, not a rewrite)

Already done: the `AdminModule` registry + `modulesFor`, `AdminModuleCard`, the dock
shell, and four scopes (circle/hub/nexus/event) resolving capabilities. New work:

1. **Expand `AdminSlot`** to the spine (rename `settings→basics`, `content→layout`,
   `moderation→safety`; add `place`/`engage`/`reach`/`comms`).
2. **Drill-down console** — a home list (categories + live summaries + quick toggles), a
   category screen, back + search — on top of today's flat dock.
3. **Write the missing modules** per category (the `＋` rows), reusing `AdminModuleCard` +
   capability-gated actions.
4. **The `@admin` server slot** so each category screen is server-composed (RSC donut).

---

## 1. Where Phase 1 left off

The shipped dock (`components/layout/page-admin-dock.tsx`, wired in `app-shell.tsx`) is
the **right chrome** and we keep it as-is:

| ✅ Done in Phase 1 (ADR-128) | Keep |
|---|---|
| Edge tab (desktop, light) / Shield button (mobile header) trigger | yes |
| Slide-out panel, **push** (pads `[data-feed-scroll]` via `--admin-pr`) or **overlay**, persisted (`freq-admin-mode`) | yes |
| Drag-resizable width, persisted (`freq-admin-width`) | yes |
| Operators-only (`meetsAccess('host')` or any staff; never a member) | yes — tightens (§4) |

What Phase 1 **defers** — and what this doc specifies:

| ⏳ Phase 1 gap | Phase 2 (this doc) |
|---|---|
| Panel is a **fixed action list** branched on role | **`AdminModule` registry** filtered by capability (§3) |
| Actions **deep-link into `/admin/*`** (`Edit info → /admin/circles`, `Settings → /admin`, …) | **In-place editing** via `AdminModuleCard` setting boxes (§2) |
| "Layout template" / "Basic styles" are **"Soon"** | In-place layout/style modules (§2, later sub-phase) |
| Gating is **by role today** | Granular **capabilities** + ADR-127 **operations roles** (§4) |
| Content is a **client** fixed list | **Server-composed** per-tier content (RSC donut, §5) |

ADR-128 said it plainly: *"Gating is by role today; it tightens to the granular
capability set (and the ADR-127 operations roles) as those land. Phase 2 brings true
in-place layout/style editing."* This is that Phase 2.

---

## 2. The atomic unit — `AdminModuleCard` (in-place setting box)

Today a dock action is a `<Link>` to an `/admin/*` page. Phase 2 replaces each with an
**in-place setting box** that edits on the page. **A thin wrapper over the existing
`SidebarCard`** — no new hardcoded styles. Five zones:

```
┌─────────────────────────────────────────────┐  rounded-2xl border border-border bg-surface
│ ◔  Circle details              [ active ]    │  1. header: px-4 py-2.5 border-b · text-sm font-bold
├─────────────────────────────────────────────┤     icon h-4 text-primary-strong · right status pill
│ Name, about, member cap, status.             │  2. description (optional): px-4 pt-3 text-sm text-muted
│                                              │
│ [ Encinitas Morning Ride________________ ]   │  3. control area: px-4 py-3
│ [ Status ▾ ]            [ Member cap  12 ]   │     inputs rounded-lg border-border focus:ring-primary
│                                              │  4. inline list (optional): rounded-2xl bg-surface-elevated/60
├─────────────────────────────────────────────┤
│                       [ Save ]   Cancel      │  5. footer/save: px-4 py-3 border-t
└─────────────────────────────────────────────┘     Save = rounded-lg bg-primary text-on-primary
```

- **Save / dirty:** client leaf, `useTransition`, optimistic; the server action
  re-checks capability. Dirty enables the footer Save (`disabled:opacity-40` →
  "Saving…" → inline `Check`). Toggles auto-save on change (no footer).
- **Radius/tokens:** card `rounded-2xl`, controls `rounded-lg`; semantic tokens only.
  No `text-[10/11px]` for content, no `shadow-2xl`, no hardcoded hex. (The dock's own
  header chrome predates parts of the scale — don't copy its `text-[10/11px]` into module
  bodies.)
- A "Soon" item (Layout template, Basic styles) becomes a real module when its in-place
  editor lands; until then it keeps the dock's disabled "Soon" row.

---

## 3. The content engine — `AdminModule` registry

Replace the dock's hand-written `actions: Action[]` (the fixed `link`/`soon` list) with a
**declarative catalog filtered by capability** — the same pattern as `ADMIN_GROUPS`
(`app/(main)/admin/sections.ts`) and the operations capability map (`lib/core/staff-roles.ts`).
Gate on **capability**, not a flat `minRole`, so per-scope leadership (a guide who leads
*this* hub, a crew member with an open task) and operations-role grants flow through.

```ts
// lib/admin/modules/registry.ts
import type { LucideIcon } from 'lucide-react'
import type { Capability, Scope } from '@/lib/core/capabilities'

export type ScopeKind = Scope['kind']               // 'global' | 'circle' | 'profile' | 'hub' | 'nexus' (+ 'event' | 'channel' later)
export type AdminSlot  = 'settings' | 'people' | 'content' | 'moderation' | 'insights' | 'danger'

export interface AdminModule {
  id: string                                         // 'circle.settings'
  label: string
  desc?: string
  Icon: LucideIcon
  scopes: readonly ScopeKind[]                       // which scope kinds this attaches to
  requiredCapability: Capability                     // gated against resolveCapabilities(viewer, scope)
  slot: AdminSlot
  order: number
  Component: (p: { scope: Scope }) => Promise<React.ReactElement | null>  // self-fetching RSC; null when empty
}

/** Which modules render for (scope, capabilities). Tiers emerge from filtering. */
export function modulesFor(scope: Scope, caps: ReadonlySet<Capability>): AdminModule[] {
  return ADMIN_MODULES
    .filter((m) => m.scopes.includes(scope.kind) && caps.has(m.requiredCapability))
    .sort((a, b) => a.order - b.order)
}

/** The dock already gates by role; this refines its visibility to capabilities. */
export function showsAdminPanel(scope: Scope, caps: ReadonlySet<Capability>): boolean {
  return modulesFor(scope, caps).length > 0
}
```

A **host** on their circle resolves `{editSettings, moderate, assignTask, broadcast}` →
settings + tasks + moderation boxes. A **crew member** resolves only `{circle.view,
task.volunteer}` → no admin-grade module. An **Operations** staff role resolves the
community-admin capabilities (via `staffCan`) → the same community boxes on any circle. A
**janitor** resolves the full set → everything. The "different view per tier" is produced
by filtering — **zero per-tier branching** (it removes the dock's `isJanitor ? […]` and
`can('host')` ladders).

The dock's `sectionEdit(pathname)` prefix map (`/circles → Circles`, `/events → Events`, …)
generalizes into a **scope resolver**: the page declares its `Scope`; the engine resolves
`caps`; the registry renders the modules. (Optionally formalized as a pure
`adminScopeFor(pathname)`, sibling to `railFor` in `lib/layout/page-chrome.ts`.)

---

## 4. Gating — capabilities + operations roles (already built)

- **`lib/core/capabilities.ts`** → `resolveCapabilities(viewer, scope): Set<Capability>`:
  pure, deterministic. Scopes: `global | circle | profile | hub | nexus`.
- **`lib/core/load-capabilities.ts`** — the server seam: `getGlobalCapabilities()`,
  `getCircleCapabilities(circleId)`, `getProfileCapabilities(ownerId)`. **Gap to close:**
  no `hub`/`nexus` loaders yet (the resolver handles those scopes); add them + a
  `loadCapabilitiesForScope(scope)` dispatcher.
- **`lib/core/staff-roles.ts` + `lib/staff.ts` (`staffCan`/`requireStaffCap`)** — the
  ADR-127 operations axis (Owner · Admin · Operations · Marketing · Accounting · Support ·
  Analyst), data-driven over `ADMIN_GROUPS` + `area_permissions` + the resolver. The dock's
  visibility predicate (`meetsAccess('host', role) || isStaff`) tightens to: *render a
  module iff the viewer holds its `requiredCapability` for this scope* — community role
  **or** the matching operations `staffCan(domain)`.
- **Enforcement unchanged (non-negotiable).** `requiredCapability` is UX metadata; every
  module's server action re-resolves capabilities/`staffCan` before mutating (the
  `inviteByEmail` / `requireStaffCap` pattern). The admin client bypasses RLS, so the
  action is the authority. ADR-127's "write-action parity" slice and this registry meet
  here: one capability named in the registry **and** enforced in the action.

---

## 5. Composition — server content in the client dock (the donut)

The dock is a client component (`'use client'`) that owns open/mode/width. Phase 2 keeps
that and feeds it **server-composed** module content as `children` (the donut — already how
`app/(main)/layout.tsx` streams the sidebar/ticker into the client `AppShell`):

```
app/(main)/layout.tsx (SERVER)
  ├─ children ───────────► page content (server)
  └─ @admin slot (server) ► AppShell adminPanel={admin}
                              └─ <PageAdminDock …>{adminPanel}</PageAdminDock>   (client chrome, server children)
```

Wire module content as a Next 16 **`@admin` parallel-route slot**: each `@admin/.../page.tsx`
is an RSC that resolves the viewer's tier and renders its modules inside `<Suspense>` — so
**no other tier's UI ships to the client bundle**. Add `app/(main)/@admin/default.tsx`
returning `null` (without it a refresh 404s). All slots at one segment share dynamic-ness —
fine, the authed app is already dynamic. The dock's push/overlay/resize chrome is untouched.

---

## 6. Absorbing `/admin/*` (the end state)

The dock today **launches into** `/admin/*`. Phase 2 **absorbs** it, surface by surface: as
a surface gets an in-place module, its dock link becomes the module. The residual platform
surfaces (Members, Roles, AI, Vera, analytics) collapse into a **`global`-scope Platform**
group of modules; `/admin/*` retires once empty.

| Bucket | Surfaces | Phase 2 home |
|---|---|---|
| ✅ **Scoped** | Circles, Events, Hubs, Nexuses, per-circle Broadcasts + Crew tasks | In-place modules on each entity's page (replaces the deep-link) |
| 🌐 **Global** | Members, Roles, AI, Demo, Vera, Help gaps, analytics, QR | `global`-scope modules (the Platform group) |
| ⚠️ **Both** | Channels, Moderation, Broadcasts | Per-scope module **and** a global module |

---

## 7. Build sequence (additive, each step shippable)

> **Progress:** ✅ the registry/engine (`lib/admin/modules/registry.ts` —
> `modulesFor`/`showsAdminPanel`, tested), `AdminModuleCard`, and in-place
> **Circle / Hub / Nexus / Event** settings modules have landed (steps 2–3), with
> `hub`/`nexus`/`event` capability loaders added to `load-capabilities.ts` and an
> `event` scope + `event.editSettings` added to the resolver. Still open: the
> `loadCapabilitiesForScope` dispatcher and the server-composed `@admin` slot —
> modules currently wire into the client dock with an on-open, capability-gated
> fetch (`get*AdminData`) rather than server composition. **Next milestone:** the
> drill-down **settings console** + the 9-category spine (ADR-137, see the
> target-shape section above).

1. **Engine.** `AdminModule` registry + `modulesFor`/`showsAdminPanel`; `AdminModuleCard`
   over `SidebarCard`; add `hub`/`nexus` loaders + `loadCapabilitiesForScope`; the `@admin`
   slot + `default.tsx`. Swap the dock's fixed `actions` list for `modulesFor(scope, caps)`
   (behaviour-preserving first: render the same items as modules).
2. **Pilot: Circles.** Convert `Edit info → /admin/circles` into an in-place
   `circle.settings` module (the first real in-place editor); validate gate → module →
   action re-check end to end.
3. **Roll scoped surfaces.** Events, Hubs, Nexuses (add `event` scope), then per-circle
   Broadcasts / Tasks / Moderation.
4. **Platform group.** Global modules for Members/Roles/AI/Demo/Vera/analytics/QR; tighten
   the dock visibility to capabilities + `staffCan`.
5. **Retire `/admin`.** Remove the route group once every link is a module. Land the "Soon"
   Layout/Basic-styles in-place editors. Update docs (§8); operator guide → Notion.
6. **Console + spine (ADR-137).** Expand `AdminSlot` to the 9-category spine; build the
   **drill-down console** (home list with live summaries + quick toggles → category screen →
   back + search) over the dock; add page-level **Edit Mode** + inline click-to-edit handles.
7. **Full suite.** Fill the missing modules per category (Place / Layout / Engage / Reach /
   Comms / Safety / Insights) per the Circle worked example; the **global Platform console**
   subsumes Members / Roles / AI / Vera, completing step 5.

---

## 8. Docs & decisions this touches

- **New ADR:** [ADR-133](DECISIONS.md) — Phase 2 decision; reconciled with the
  parallel-shipped Phase 1 (ADR-128) and operations roles (ADR-127).
- **New ADR:** [ADR-137](DECISIONS.md) — the settings console: on-page Edit Mode, the
  9-category spine, and drill-down navigation (the target shape above).
- **Refined:** [CAPABILITIES-AND-MOBILE.md §2](CAPABILITIES-AND-MOBILE.md) — the inline-admin
  model is realized by the dock (Phase 1) and made capability-driven + in-place (Phase 2).
- **Refined:** [PAGE-FRAMEWORK.md §3/§6](PAGE-FRAMEWORK.md) — `headerActions` "admin gear" =
  the dock trigger; `/admin/*` is being absorbed, not a standalone pattern.
- **Add on ship:** kit entry for `AdminModuleCard` (DESIGN.md "In-app scale"),
  `DEVELOPMENT-MAP.md` build-status, and a Notion operator page (source of truth = this doc).
