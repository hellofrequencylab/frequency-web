# Embedded Admin — the per-page admin panel framework

> **The answer first:** retire the centralized `/admin/*` section. Admin lives
> **on the page it governs**. Any page a viewer can administer shows an always-present
> **Admin** button; it opens a right **slide-out panel** whose contents are computed
> per viewer from *(this page's scope) × (your capabilities for it)*. Each tier sees a
> different view automatically — **same box format, more boxes**. Quick edits also
> appear **inline** where the thing lives; the panel holds the full set.
>
> Decision: [ADR-126](DECISIONS.md#adr-126-embedded-per-page-admin-panel-replaces-the-centralized-admin-section).
> Refines [CAPABILITIES-AND-MOBILE.md §2](CAPABILITIES-AND-MOBILE.md) and
> [PAGE-FRAMEWORK.md §3/§6](PAGE-FRAMEWORK.md). Builds on the capability resolver
> (`lib/core/capabilities.ts`) and the five-template / declarative-chrome kit
> (PAGE-FRAMEWORK §8).
>
> **Status:** ✅ designed · ⏳ build pending. Nothing in this doc is wired yet.

---

## 1. The model

Today admin is a place you *go to* — `/admin/*`, a two-layer nav (categories in the
rail, pages as sub-tabs), gated by `requireAdmin('host')`, declared in one catalog
(`app/(main)/admin/sections.ts`). ~21 surfaces, each its own page.

The new model: admin is a thing you *do where you are*.

| Principle | What it means |
|---|---|
| **Actions live where the thing lives** | The panel opens *on* the circle / event / hub page it governs. No round-trip to a separate section. |
| **One button, everywhere capable** | An always-present **Admin** trigger appears on every page the viewer can administer — and only those. A member never sees it. |
| **Tiers are filtering, not branching** | The panel renders the admin modules whose capability the viewer holds for this scope. Host → 3 boxes; janitor → 9 boxes. Identical box format, more boxes. No per-role layouts. |
| **Panel + light inline** | Quick, single-field edits (rename, a status toggle) appear inline on the page. The panel is the consolidated home for the full per-tier set. |
| **Capabilities are law server-side** | The panel and inline affordances are *UX*. Every mutation re-resolves capabilities in the server action before writing. Visibility ≠ authorization. |
| **Global admin is one panel, not a section** | Platform-only surfaces (Members, Roles, AI, Demo, analytics, QR) move into a single global **Platform admin** panel reachable from the header. `/admin/*` is retired. |

**Why this is low-risk:** the hard half already exists. `lib/core/capabilities.ts`
(`resolveCapabilities(viewer, scope)`) is a pure policy engine whose own comment says
it was built to be tuned *"as the inline-admin work (Phase 1) lands."* This is Phase 1.
We add a thin presentation + registry layer on top — not a new permission system.

---

## 2. The four building blocks

| # | Piece | Location | New? |
|---|---|---|---|
| 1 | **`Sheet`** — the reusable right slide-out (overlay, focus-trap, ESC, scroll-lock) | `components/ui/sheet.tsx` | New |
| 2 | **`AdminModuleCard`** — the atomic "setting box" | `components/admin/admin-module-card.tsx` | New (wraps existing `SidebarCard`) |
| 3 | **`AdminModule` registry** — declarative catalog, filtered by capability | `lib/admin/modules/` | New (mirrors `sections.ts` shape) |
| 4 | **Trigger + chrome map** — header button + `adminFor(pathname)` | `app-shell.tsx` + `lib/admin/page-admin.ts` | New (sibling of `page-chrome.ts`) |

### 2.1 `Sheet` — the slide-out primitive

We have **no drawer/sheet primitive** today (only `report-dialog.tsx`, and the
hand-rolled `MobileLeftDrawer` inside `app-shell.tsx`). No dialog dependency is
installed — **no `@radix-ui/*`, no `vaul`, no Headless UI**. Every overlay in the app
is hand-built with `fixed` + Tailwind transitions.

**Decision: build a hand-rolled `Sheet` on existing tech — do not add a dependency.**
It mirrors `MobileLeftDrawer` (a working slide-out) on the right, and it *adds the
accessibility the current dialogs lack*:

- Slide from right via `translate-x`; dimmed scrim (`bg-black/40 backdrop-blur-sm`).
- Desktop: `w-full max-w-md` (≈28rem). Mobile (`< sm`): full-screen (`inset-0`).
- **Focus trap** on open + focus restore on close; **ESC** to close; **body scroll
  lock**; `role="dialog"` + `aria-modal` + `aria-label`; scrim-click to dismiss.
- `createPortal` to escape the shell's `overflow-hidden`; honor `prefers-reduced-motion`.
- Renders **server `children`** — it owns open/close, the content is server-composed
  (see §5, the donut pattern).

`Sheet` is generic: it consolidates what `report-dialog` and the mobile drawers each
re-implement, so future overlays adopt it too.

### 2.2 `AdminModuleCard` — the setting box

The atomic unit inside the panel. **A thin wrapper over the existing `SidebarCard`** —
zero new hardcoded styles. Five zones:

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
- **Radius by role:** card `rounded-2xl`, controls `rounded-lg` (per DESIGN.md). Do not
  introduce `rounded-xl`/`3xl`, `text-[10/11px]`, `shadow-2xl`, or hardcoded hex — those
  exist in some pre-scale files (`circle-host-menu.tsx`, `award-dialog.tsx`); don't copy them.

### 2.3 `AdminModule` registry

The panel's contents are a **declarative catalog**, filtered by capability — the same
pattern as `ADMIN_GROUPS` in `sections.ts` and the widget registry in PAGE-FRAMEWORK §4.
The one upgrade: gate on **`requiredCapability`** (from the resolver), not a flat
`minRole`, so per-scope leadership (a guide who leads *this* hub, a crew member with an
open task) flows through automatically.

```ts
// lib/admin/modules/registry.ts
import type { LucideIcon } from 'lucide-react'
import type { Capability, Scope } from '@/lib/core/capabilities'

export type ScopeKind = Scope['kind']               // 'global' | 'circle' | 'profile' | 'hub' | 'nexus'
export type AdminSlot  = 'settings' | 'people' | 'content' | 'moderation' | 'insights' | 'danger'

export interface AdminModule {
  id: string                                         // 'circle.settings'
  label: string                                      // panel section header
  desc?: string                                      // one-line purpose
  Icon: LucideIcon
  scopes: readonly ScopeKind[]                       // which scope kinds this module attaches to
  requiredCapability: Capability                     // gated against resolveCapabilities(viewer, scope)
  slot: AdminSlot                                     // panel grouping
  order: number                                      // vertical order within a slot
  Component: (p: { scope: Scope }) => Promise<React.ReactElement | null>  // self-fetching RSC; null when empty
}

/** The engine: which modules render for (scope, capabilities). Tiers emerge from filtering. */
export function modulesFor(scope: Scope, caps: ReadonlySet<Capability>): AdminModule[] {
  return ADMIN_MODULES
    .filter((m) => m.scopes.includes(scope.kind) && caps.has(m.requiredCapability))
    .sort((a, b) => a.order - b.order)
}

/** Show the Admin button iff the viewer holds any admin-grade capability for this scope. */
export function showsAdminPanel(scope: Scope, caps: ReadonlySet<Capability>): boolean {
  return modulesFor(scope, caps).length > 0
}
```

Example entries:

```ts
export const ADMIN_MODULES: readonly AdminModule[] = [
  { id: 'circle.settings', label: 'Circle settings', desc: 'Name, about, capacity, status.',
    Icon: Settings, scopes: ['circle'], requiredCapability: 'circle.editSettings',
    slot: 'settings', order: 10, Component: CircleSettingsForm },   // calls updateCircle(); action re-checks caps
  { id: 'circle.tasks', label: 'Crew tasks', desc: 'Assign and verify member tasks.',
    Icon: ClipboardList, scopes: ['circle'], requiredCapability: 'circle.assignTask',
    slot: 'people', order: 20, Component: CircleTasksPanel },
]
```

A **host** on their circle resolves `{editSettings, moderate, assignTask, broadcast}`
→ settings + tasks + moderation boxes. A **crew member** resolves only
`{circle.view, task.volunteer}` → no admin-grade module → the button is hidden. A
**janitor** resolves the full set + `admin.access` → everything, on every circle. The
"different admin view per tier" is produced by filtering, with **zero per-tier code**.

### 2.4 The trigger + chrome map

- **Where the button lives:** the **global header** account/admin cluster in
  `app-shell.tsx`. The header sits *above* the template layer, so one button appears
  identically across all five templates (Stream/Index/Detail/Dashboard/Focus) and
  survives tab navigation inside a Detail layout. (Per-page `PageHeading.actions` was
  rejected — it would mean editing every template, the authoring the framework forbids.)
- **Distinct from the existing `/admin` link** in the account dropdown (which goes to
  the standalone section — retired at the end of the rollout). The new button reads as
  "admin *this* page" and only appears when `adminFor(pathname) != null` **and** the
  viewer holds a capability for the scope.
- **The chrome map** — a pure function, sibling to `railFor`:

```ts
// lib/admin/page-admin.ts  (sibling of lib/layout/page-chrome.ts; locked by page-admin.test.ts)
export type AdminSurface = { key: string; label: string; scope: ScopeKind }
export function adminFor(pathname: string): AdminSurface | null
//  /circles/[slug] -> { key:'circle', label:'Manage circle', scope:'circle' }
//  /settings, /feed (no admin) -> null
```

This keeps "is this route administrable" (static, path-based) separate from "may this
viewer admin it, at this tier" (dynamic, server-resolved) — the same split the docs call
"capabilities are UX for the client, law for the server."

---

## 3. The panel — visual & interaction spec

```
                       ╔═ scrim (bg-black/40 backdrop-blur) ═══════════╗
                       ┌───────────────────────────────────────────────┐
                       │ ENCINITAS MORNING RIDE            [Janitor]  ✕ │  sticky header (AdminPage grammar)
                       │ Admin                                          │  eyebrow=scope · title · tier badge · close
                       ├───────────────────────────────────────────────┤
                       │ Settings                                       │  AdminSection (SectionHeader)
                       │ ┌ ◔ Circle details ───────────────[ active ]┐ │  AdminModuleCard
                       │ │   [ Name______ ] [ Status ▾ ] [ Cap 12 ]  │ │
                       │ │   ───────────────────────  [ Save ] Cancel│ │
                       │ └────────────────────────────────────────────┘ │
                       │ ┌ ⚲ Broadcast              on ◉───            ┐ │  toggle box (auto-save)
                       │ People                                         │
                       │ ┌ ♟ Host                       reassign ▾    ┐ │
                       │ Moderation                          (janitor)  │
                       │ ┌ ⚑ Reports                         [ 2 ]    ┐ │
                       │ Platform                            (janitor)  │
                       │ ┌ ✦ Demo/claim · ⚠ Danger zone (archive)    ┐ │
                       └───────────────────────────────────────────────┘
                         (host sees only the first three boxes — same format)
```

- **Shell:** `fixed inset-y-0 right-0 z-50`, `w-full max-w-md` desktop / full-screen
  mobile. Scrim `z-40`. `bg-canvas` body, `bg-surface` header.
- **Header:** the `AdminPage` grammar — eyebrow = scope name (`text-xs uppercase
  tracking-wide text-subtle`), title "Admin" (`text-2xl font-bold`), a **tier badge**
  on the right showing the viewer's *effective* role (honors "view as", ADR-045), close `✕`.
- **Body:** one scrollable `space-y-6` column of `AdminSection`s holding `AdminModuleCard`s.
  **Sections, not tabs** — tiers get *more sections/boxes*, not different tabs. (A tier
  with many groups can collapse sections; tabs are a later option only if needed.)
- **States:**

| State | Spec (existing primitives) |
|---|---|
| **Loading** | Per-box skeleton inside its own `<Suspense>` (dimension-matched, PAGE-FRAMEWORK §5). Never block the panel open. |
| **Empty** | `EmptyState` inside the box body ("No crew tasks yet."). |
| **Role-absent** | Don't render the box (out of the DOM) — and if no box qualifies, the button never shows. |
| **Tier-locked** (upsell, e.g. free→paid) | Dimmed box + lock icon + upgrade affordance (reuse `crew-gate-button.tsx`, IA-STRATEGY §2). |

- **Token mapping (no new hardcoded styles):** scrim/shell = the only new chrome;
  header = `AdminPage` grammar; sections = `AdminSection`/`SectionHeader`; box =
  `SidebarCard`; stats = `StatCard`; inputs/Save = the `circles-client` idiom
  (`rounded-lg border-border focus:ring-primary`, `bg-primary text-on-primary`);
  empty/locked = `EmptyState`/`crew-gate-button`; icons = `lucide-react text-primary-strong`.

---

## 4. The gating engine

### 4.1 The policy layer (already built)

`lib/core/capabilities.ts` → `resolveCapabilities(viewer, scope): Set<Capability>`:
pure, deterministic, framework-independent. Scopes today: `global | circle | profile |
hub | nexus`. The circle scope carries `hostId`, `membership`, `openTaskCount`,
`viewerManagesParent` — everything needed to decide leadership.

`lib/core/load-capabilities.ts` is the **server seam** that fetches live DB inputs and
calls the resolver: `getGlobalCapabilities()`, `getCircleCapabilities(circleId)`,
`getProfileCapabilities(ownerId)`. **Gap to close:** there are no `hub`/`nexus` loaders
yet (the resolver handles those scopes, the loaders don't exist). Add them, plus a
generic dispatcher:

```ts
// lib/core/load-capabilities.ts (add)
export async function loadCapabilitiesForScope(scope: Scope): Promise<Set<Capability>>
// dispatches to getCircle/Profile/Hub/Nexus/Global by scope.kind
```

### 4.2 Scope resolution per page

The Circle detail page **already does exactly this**: it loads the circle row, calls
`getCircleCapabilities(circle.id)`, derives `canManage = caps.has('circle.editSettings')`,
and gates host affordances on it. Each page already knows its scope identity (it loaded
the entity). The panel consumes the *same* resolved `caps` the page already has — no new
auth round-trip.

### 4.3 Enforcement (non-negotiable)

The registry's `requiredCapability` is **UX metadata only**. Every module's server
action re-resolves capabilities before mutating — the pattern `inviteByEmail` already
uses (`getCircleCapabilities(circleId)` → reject unless `caps.has('circle.editSettings')`).
The admin client bypasses RLS, so the action — not RLS — is the authority. Because of
"view as," the client's capability set may be a downgraded preview; only the server's
fresh resolve is law. As embedded admin lands, the scattered inline `janitor()` /
`hasRole()` guards converge onto the `resolveCapabilities` seam.

### 4.4 There is no DB permission grid

Capabilities are **code-driven** (the `resolveCapabilities` ladder). The "permission
grid" at `/admin/roles` manages `area_permissions` — *nav-area visibility* overrides,
not capabilities. So tier-views are composed in **code** (the module registry filtered
by the resolved set), which is the right grain. A config-driven `module_key → min_role`
override table is *possible* later (copy the `area_permissions` pattern) but is **not**
built now — no current requirement, and it adds drift surface.

---

## 5. Shell integration (how server content streams into a client drawer)

- **Overlay, never push.** The panel floats above the body (`z-50` panel / `z-40`
  scrim, portaled), so it works identically on a `'global'` page (right rail present),
  a `'scoped'` Detail page (in-body scope rail), and a `'none'`/Focus page. A *push*
  model would fight the global right rail for the right edge — the exact double-rail trap
  `page-chrome.ts` exists to avoid. The panel is **orthogonal to `railFor()`** and must
  not be added to it.
- **The donut (RSC into a client drawer):** a thin client `Sheet` owns open/close;
  its `children` are **server-composed** and passed as a prop — the same pattern
  `app/(main)/layout.tsx` already uses to stream the sidebar/ticker into the client
  `AppShell`. Wire the panel content as a **Next 16 parallel-route slot `@admin`**:

```
app/(main)/layout.tsx (SERVER)
  ├─ children ───────────► page content (server)
  └─ @admin slot (server) ► AppShell adminPanel={admin}
                              └─ <Sheet open={adminOpen}>{adminPanel}</Sheet>   (client shell, server children)
```

  Each `@admin/.../page.tsx` is an RSC that resolves the viewer's tier and renders that
  tier's modules inside `<Suspense>`. **No other tier's UI ships to the client bundle** —
  the security property the capability seam guarantees. Add `app/(main)/@admin/default.tsx`
  returning `null` (without it, a refresh 404s). All slots at one segment share
  dynamic-ness — fine, the authed app is already dynamic.

**Risks tracked:** 🔴 right-edge collision → solved by overlay; ⚠️ z-index ordering
(panel above header z-30, tab bar z-40, edge rails z-20 → portal at z-50/40); ⚠️ mobile
(full-screen sheet, don't fight the bottom tab bar); ⚠️ the client header needs a
server-resolved visibility flag (pass `adminTier`/visibility from `layout.tsx` into
`AppShell`, as it already passes `permissions`/`staffRole`); ⚠️ two "Admin" affordances
(the retired `/admin` link vs the page button) — distinguish during rollout.

---

## 6. Global / platform admin — retiring `/admin`

Surfaces that don't belong to an entity (the platform tier) move into **one global
Platform admin panel**, triggered from the header on any page (scope `global`). It uses
the same `Sheet` + `AdminModuleCard` + registry, with `scopes: ['global']` modules.
`/admin/*` is removed once every surface has a home.

| Bucket | Surfaces | Embedded home |
|---|---|---|
| ✅ **Scoped** | Circles, Events, Hubs, Nexuses, per-circle Broadcasts + Crew tasks | Panel on each entity's Detail page |
| 🌐 **Global** | Members, Roles, AI controls, Demo Studio, Vera, Help gaps, analytics (Engagement/Intel/Outcomes/Insights/Segments), QR Studio/Stats | The single global **Platform admin** panel |
| ⚠️ **Both** | Channels, Moderation, Broadcasts | Per-scope module **and** a global module (a moderation box on a circle *and* in Platform) |

---

## 7. Inline affordances (the "panel + light inline" half)

Two complementary affordances, one policy:

| Affordance | For | Example |
|---|---|---|
| **Inline edit-in-place** | Quick, single-field, high-frequency edits | Pencil on a circle name; a status toggle in the header; "Assign task" on a task row |
| **Admin panel** | The full, grouped, per-tier set | Settings, moderation, host reassignment, danger zone, platform tools |

Both are gated by the **same** `caps` and enforced by the **same** server actions.
Inline affordances are the evolution of today's `StaffEditButton` / `CircleHostMenu`;
the panel is the consolidated home that replaces deep-linking to `/admin`.

---

## 8. Surface inventory & porting map

| Surface | Today's route | Min role | Scope | Embedded home |
|---|---|---|---|---|
| Circles | `/admin/circles` | host | circle | Panel on `/circles/[slug]` (+ inline edit) |
| Events | `/admin/events` | host | event* | Panel on `/events/[slug]` |
| Channels | `/admin/channels` | host | channel*/global | Channel panel + Platform module |
| Broadcasts | `/admin/dispatches` | host | circle/global | Per-circle module + Platform module |
| Crew tasks | `/admin/crew-tasks` | host | circle/global | Per-circle module + Platform (definitions/queue) |
| Gamification | `/admin/gamification` | host | global (+per-circle stats) | Platform panel (+ optional circle stats box) |
| Moderation | `/admin/moderation` | host | circle/global | Per-scope module + Platform queue |
| Hubs | `/admin/hubs` | guide | hub | Panel on `/hubs/[slug]` |
| Nexuses | `/admin/nexuses` | mentor | nexus | Panel on `/nexuses/[slug]` |
| Engagement / Intel / Outcomes / Insights / Segments | `/admin/*` | janitor | global | Platform panel (Insights section) |
| Vera / Help gaps | `/admin/vera`, `/admin/help-gaps` | janitor | global | Platform panel (Vera section) |
| Members / Roles / AI / Demo | `/admin/*` | janitor | global | Platform panel (Platform section) |
| QR Studio / QR Stats | `/admin/qr*` | host | global | Platform panel (QR section) |

\* `event`/`channel` are new scope kinds to add to the `Scope` union + resolver as those
pages get panels (circle/profile/hub/nexus/global exist today).

---

## 9. Build sequence (phased, additive, each step shippable)

1. **Framework.** `Sheet` primitive → `AdminModuleCard` → `AdminModule` registry +
   `modulesFor`/`showsAdminPanel` → `lib/admin/page-admin.ts` + test → header trigger →
   `@admin` parallel slot + `default.tsx`. Add `hub`/`nexus` loaders + `loadCapabilitiesForScope`.
2. **Pilot: Circles.** Richest scope, already has `getCircleCapabilities` and scattered
   host tools to absorb. Port circle admin into modules; add inline edit-in-place.
   Validate the whole loop (gate → panel → module → action re-check) on one surface.
3. **Roll the scoped surfaces.** Events, Hubs, Nexuses (add `event` scope as needed),
   then per-circle Broadcasts/Tasks/Moderation modules.
4. **Platform panel.** Build the `global` modules; move Members/Roles/AI/Demo/Vera/
   analytics/QR in. Add the header global trigger.
5. **Retire `/admin`.** Remove the route group + `sub-nav` + `sections.ts` once every
   surface has a home. Update docs (§10). Write the operator "how to use the Admin panel"
   Notion page (instructional → Notion, links back here).

---

## 10. Docs & decisions this touches

- **New ADR:** [ADR-126](DECISIONS.md) — the decision + supersession record.
- **Refined:** [CAPABILITIES-AND-MOBILE.md §2](CAPABILITIES-AND-MOBILE.md) — was
  "edit-in-place, no admin tab, the Admin tab is the Janitor's"; now "a per-page admin
  panel for *every* capable tier, opened on the page; members still see no admin chrome."
  The §3 invariant (server re-checks) is unchanged.
- **Refined:** [PAGE-FRAMEWORK.md §3/§6](PAGE-FRAMEWORK.md) — the Detail `headerActions`
  "admin gear" becomes the panel trigger; `/admin/*` is no longer "its own pattern."
- **Supersedes in part:** ADR-119 (the "Edit circle" button deep-linking to
  `/admin/circles?edit=`) — the panel/inline edit reuses the same server actions instead
  of deep-linking to a section that no longer exists.
- **Add on ship:** kit entry for `Sheet` + `AdminModuleCard` (DESIGN.md "In-app scale");
  `DEVELOPMENT-MAP.md` build-status line; per the docs protocol, the operator guide goes
  to Notion (instructional), source-of-truth = this doc.
