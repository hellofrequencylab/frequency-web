# The Loom Platform — one asset + App control plane for the whole site

> **The Loom stops being an image library and becomes the site-wide control plane for
> every asset AND every functional feature.** Every functional snippet on the site
> (an editor module, a page widget, a rail card, a code-drawn graphic) becomes an **App**
> with one uniform shape. Apps are browsed, applied, configured, restyled, and versioned
> in The Loom the same way images are today. The right-rail settings drawer becomes one
> **standardized admin bar** whose menu is those Apps, filtered by page × role. Every page
> composes a template and every feature is a reusable block. One catalog feeds all of it.
>
> **The thesis:** the hard parts are already built. The Loom DAM, the module engine, the
> 9-category admin spine, the capability model, and the template kit all exist. The gap is
> **cohesion**: three registries, two capability systems, and ~18 of ~230 pages actually
> block-driven. This plan unifies them behind one `App` contract and makes The Loom the
> place you manage them.
>
> **Authority order:** running code + `supabase/migrations/` > this doc > Notion.
> **Status legend:** ✅ built · 🟡 partial / extend · 📐 designed only · 🆕 net-new · 🔒 deferred.
> **Task IDs** (`LP#`) are stable handles. **Proposed ADRs:** 498–504 (next free is 498).
>
> **Plugs into:** [LIBRARY.md](LIBRARY.md) (The Loom / DAM), [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md)
> (templates + module engine), [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md) (the 9-category spine +
> admin dock), [ENTITY-MANAGEMENT-OVERHAUL.md](ENTITY-MANAGEMENT-OVERHAUL.md) (ADR-441, the
> per-entity console this generalizes), [CAPABILITIES-AND-MOBILE.md](CAPABILITIES-AND-MOBILE.md)
> + [ROLES.md](ROLES.md) (the gate model). **Gated by:**
> [FOUNDATION-HARDENING-PLAN.md](FOUNDATION-HARDENING-PLAN.md) (client RLS work).

---

## 1. The diagnosis (why now)

Everything needed for this exists — it is just fragmented across parallel systems that don't
know about each other.

| Layer | State | Finding |
|---|---|---|
| **The Loom (DAM)** | ✅ solid | `library_assets` is already polymorphic (`kind` = image/icon/element/template/flow/theme/app_asset), space-scoped (root = shared), with `config jsonb`, non-destructive `library_versions`, a `library_usages` xref, collections, and semantic search. Built to "grow for years without a code deploy per asset." |
| **Feature registries** | 🔴 fragmented | **Three** parallel catalogs describe "a feature": `AdminModule` (sidebar editors, `lib/admin/modules/registry.ts`), `LAYOUT_MODULES` (page blocks, `lib/widgets/modules.ts`), and `element-catalog` (code-drawn SVG, `lib/library/element-catalog.ts`). Three shapes, three render paths. |
| **Capability systems** | 🟡 two of them | Community `resolveCapabilities(viewer, scope)` (`lib/core/capabilities.ts`) and per-Space `spaceFunctionAccess` / `getSpaceCapabilities` (`lib/spaces/functions.ts`). The admin surface branches per entity. |
| **The editor surface** | 🟡 partial | Circles/events open a right-rail `SettingsDrawer` whose body path-sniffs the route; only the **Basics** module is built per entity; visibility is a coarse `manager || isOperator` heuristic, not capability-driven; desktop and mobile are two components; no drill-down/search. |
| **Templates** | 🟡 broad shell, narrow block | ~182 of ~230 `app/(main)/**/page.tsx` compose a kit shell, but only **~18** render `<PageModules>` (are block-driven). ~90 `/admin/*` pages adopt a shell but hand-compose their interior. |

**Core diagnosis:** the pieces are excellent; nothing shares a spine. One `App` contract + The
Loom as its manager is the cohesion layer.

---

## 2. The target architecture

```
                          THE LOOM  — one catalog, many lanes, every entity has its own (root = shared)
  ┌──────────────────────────────────────────────────────────────────────────────────────┐
  │  Images · Icons · Elements · Templates · Themes/Tokens · Files ·  ▶ APPS (code features) │
  └──────────────────────────────────────────────────────────────────────────────────────┘
        │ every asset AND every App is one catalog row, browsable/versioned/space-scoped
        ▼
  ┌───────────────────────────── the ONE `App` contract (lib/apps) ─────────────────────────┐
  │  Function (git, read-only) · Global config (Loom) · Instances (per surface) · Style (theme) │
  └──────────────────────────────────────────────────────────────────────────────────────────┘
        │ surfaces:                                   gated by ONE bridged role resolver
        ├─ editor  ─▶ the STANDARDIZED ADMIN BAR   (menu = Apps filtered by page × role)
        ├─ page    ─▶ TEMPLATE + BLOCKS            (<PageModules> slots, every page)
        ├─ rail    ─▶ the community right rail
        └─ element ─▶ code-drawn SVG in The Loom
```

Four pillars, one spine:

- **A. Loom lanes** — open the reserved `kind`s so The Loom manages every asset type, and add
  `kind='app'`. The library doubles as living documentation ("a help section for assets").
- **B. The standardized admin bar** — the settings drawer becomes one capability-driven bar
  whose modular menu is the App catalog, appearing anywhere the viewer can edit.
- **C. Template-everywhere** — every page composes a shell; every interior feature is a block.
- **D. The unified `App` contract** — collapse the three registries and bridge the two
  capability systems behind one catalog that A/B/C all read.

---

## 3. The keystone: the `App` contract + four layers

One catalog, `lib/apps/catalog.ts` (pure metadata, no React, no Supabase — importable on client
and server). Component bindings live separately in `lib/apps/bindings.tsx` so the catalog never
pulls a Server Component (the existing `registry.tsx` discipline).

```ts
// lib/apps/catalog.ts — the ONE source of truth for "what features exist"
export type AppSurfaceKind = 'editor' | 'page' | 'rail' | 'element'

export type AppScope =
  | { on: 'scopeKind'; kind: Scope['kind'] }   // AdminModule.scopes  (circle/event/hub/…)
  | { on: 'route';     key: string }           // ROUTE_MODULE_IDS key ('*','/lead','/circles/*')
  | { on: 'spaceType'; type: SpaceType | '*' } // SpaceSurface.types
  | { on: 'library' }                          // a code-drawn element (no placement scope)

// THE bridge: one gate over both capability systems + staff + always-on.
export type AppGate =
  | { system: 'capability';    capability: Capability }         // community resolveCapabilities
  | { system: 'spaceFunction'; fn: SpaceFunctionKey; entitlement?: string } // per-Space
  | { system: 'staff';         domain?: string }                // web_role axis
  | { system: 'none' }                                          // Basics / public element

export interface App {
  id: string; label: string; description?: string
  category: AdminSlot | 'element'          // the 9-category spine slot
  scopes: readonly AppScope[]              // where it may attach (union)
  gate: AppGate                            // the single bridged gate
  connections?: readonly AppConnection[]   // external wiring it declares (Loom shows connect state)
  config?: readonly AppConfigField[]       // the editable global-config schema (Layer 2)
  surfaces: {                              // which surfaces it presents (one or more)
    editor?:  { surface: 'inline' | 'sidebar'; Icon: LucideIcon; order: number }
    page?:    { defaultTemplate?: TemplateId; defaultSlot?: string }
    rail?:    { side: 'left' | 'right' }
    element?: { registry: string; name: string; pillar?: string }
  }
  themeable: boolean
  status: 'draft' | 'in_review' | 'approved' | 'final' | 'archived'
  version: number
}
```

The four layers — where each lives, and what The Loom may edit:

| Layer | What | Source of truth | Loom edits? | Propagation |
|---|---|---|---|---|
| **1 · Function** | the component / SVG / server action — the *code* | 🔴 **git** (`lib/apps/bindings.tsx` + the catalog row) | ❌ read-only, shown with its `version` | version bump = a commit |
| **2 · Global config** | defaults, connection wiring, the gate value, config-field values | **The Loom** (`library_assets kind='app'`, root-space = platform default) | ✅ | edits write a new version; read at resolve time, merged over the catalog defaults |
| **3 · Instances** | per-surface placement + per-placement override | **`page_settings.layout`** (page) · **`app_instances`** (editor/rail) · **`library_usages`** (element) | ✅ place / reorder / hide / override | an instance references `(app_id, version)` + an optional `config_override` |
| **4 · Style** | per-theme design tokens | **`library_styles`** + `kind='theme'` token sets, plus per-instance `style_override` | ✅ pick theme / tune tokens | 🔴 tokens only, never hex; resolved per active theme |

**"Globally editable functions" = editing Layer 2**, never Layer 1 source. Reads compose
bottom-up: `catalog default ◁ global config (space) ◁ instance override` — a most-specific-wins
cascade that mirrors today's `pickLayoutConfig`. A Layer-2 edit changes every instance that has
no override; an instance override always wins locally. This is the "same box, more boxes"
behavior generalized to configuration.

---

## 4. Pillar A — Loom lanes for full asset management

`library_assets.kind` already **reserves** `icon`/`template`/`flow`/`theme`/`app_asset`; opening a
lane is largely one migration (widen the check constraint) + a resolver + a catalog file, because
code-backed lanes reuse the `element` pattern (a `config`-only row → a registry resolver, so the
catalog never holds a stale copy).

| Rank | Lane | Manages | Source | v1 verdict |
|---|---|---|---|---|
| 1 | **Apps** (`kind='app'`) | reusable code features/widgets | code (registry) + config data | ✅ **build now** — the ask |
| 2 | **Templates / flows** (`template`/`flow`) | reusable page templates + block fragments (already in `lib/page-editor/templates/*`) | data (`config`) | ✅ build (light) |
| 3 | **Brand: icons / logos / favicons** (`icon`/`app_asset`) | house icons + uploaded brand marks | mixed | ✅ build (light) |
| 4 | **Files / documents** | PDFs, downloadables | data (new `library-files` bucket + mime allowlist) | ✅ build (thin) |
| 5 | **Themes / tokens** (`theme`/`token`) | DAWN token sets / skins | data — **a system already exists** (`public.themes`, Theme Studio) | 🟡 surface read-only, deep-link to Theme Studio |
| 6 | **Email templates** | reusable subject+body | data — **already per-space** (`space_email_templates`) | 🟡 index-only lane, don't rebuild |
| 7 | Audio / video | media w/ transcoding | data | ⛔ skip v1 (explicit non-goal) |
| 8 | Fonts | font families | code today (`next/font`) | ⛔ skip v1 |
| 9 | Copy / content strings | member-facing text | data | ⛔ skip v1 (a CMS/i18n effort) |
| 10 | Data connections | integration configs (secrets) | data | ⛔ out of DAM scope |

**The "help section for assets" angle (no new table):** `library_usages` is the where-referenced
backbone — every card's detail drawer gets a **"Used in"** section listing each `context`/`ref_id`/
`block_id` as a deep link, so the library reads like a help index (click an asset → see everywhere
it lives → jump there). Docs live on existing columns (`description` = what it is / when to use it,
`alt`, `attribution`/`license`, `tags`/`category`); code lanes carry a usage note + prop/config
contract on the catalog row. Semantic search already indexes `title+description+category`, so "how
do I show a pricing table?" surfaces the pricing template for free.

**Role-based management per lane** maps each Loom scope to the right existing system rather than
inventing a fourth (gates are **view / edit / apply**):

| Loom scope | Role system | Example gate |
|---|---|---|
| **Frequency master** (root space) | staff matrix (`staffCan(role, domain, level)`) | brand assets → Marketing write; code Apps → platform write |
| **Per-space** Loom | `SPACE_FUNCTIONS` (`spaceFunctionAccess`) | new `library` function key, per-space min-role + entitlement |
| **Personal** Loom | community `resolveCapabilities` (profile scope) | new `library.view` / `library.manage` caps (like Spotlight) |

Fork-on-edit + the shared/private boundary already exist (`lib/library/store.ts`,
`lib/library/scope.ts`): a space sees its own ∪ root's public; using a shared asset **references**
it, editing **forks** a private copy (`parent_id` → master).

---

## 5. Pillar B — the standardized admin bar

Replace the drawer/sheet split with one `AdminBar` driven by `(page scope × resolved caps)`, whose
body is an iOS-Settings-style drill-down over the App catalog. Seven behavior-preserving steps:

| # | Step | Effect |
|---|---|---|
| **B0** | **Unify the scope resolver** — add `adminScopeFor(pathname)` beside `railFor` in `lib/layout/page-chrome.ts`; delete the duplicate `PATH_SCOPE_KINDS` in `settings-panel.tsx` | one answer to "what scope is this page," everywhere |
| **B1** | **Unify the catalog** (= Pillar D) — the bar reads `appsForScope(scope, caps)`, never path-sniffs | menu = the App catalog |
| **B2** | **Thread resolved caps** — add `loadCapabilitiesForScope(scope)`; carry the `Set<Capability>` into `PageAdminProvider`; switch visibility to `showsAdminPanel(scope, caps)` | the bar shows **iff `appsForScope(...).length > 0`** — no more `manager \|\| isOperator` heuristic or per-page suppression hacks |
| **B3** | **Single component** — lift `settings-drawer.tsx`'s resize/persist/focus chrome; fold `mobile-settings-sheet.tsx` in as the `<lg` branch | one component, desktop + mobile parity is structural |
| **B4** | **Drill-down + search (EM3-1)** — home = the 9-spine categories with ≥1 available App, each `icon · label · summary · ›`; category screen = its Apps; a "Search settings" box across the resolved set | scales to a full suite in a 288px rail |
| **B5** | **Typed entry seam** — replace the bare `open-settings` event with `CustomEvent<{scope?, slot?, appId?}>`; collapse the six per-entity edit buttons into one `open-admin-bar-button` | any affordance (a header button, a Loom App tile) can deep-link into one App, pre-scoped |
| **B6** | **Loom-style App management** — a per-scope App-overrides table (fail-safe to code defaults, mirroring `loadChromeOverrides`) so an operator can enable/disable/order Apps per scope, then fill the empty spine (ADR-441 Appendix A) | "features appear only when available" becomes a data decision; adding a menu option = a catalog row |

**The rule, stated once:** the admin bar appears anywhere `appsForScope(scope, caps)` is non-empty
— i.e. anywhere the viewer can edit this page's info, styles, or surface. That is the site-wide law.

---

## 6. Pillar C — template-everywhere, every feature a block

**Current adoption:** shell adoption is broad (~182 pages), block adoption is narrow (~18
surfaces). The biggest gap is `/admin/*` (~90 pages on a shell, zero blocks).

**The universal rule, precisely:** *Every page composes a kit shell (no exceptions). Every page
whose interior is a stack of standalone self-fetching sections renders them through `<PageModules>`.
The only permitted hand-composed remainder is (1) a facet-coupled section with no `x-search` seam,
and (2) an interactive editor / Studio / Puck surface* (the §10 boundary).

**A valid block** (the contract, unchanged from PAGE-FRAMEWORK §4.1 / §8.4): a self-fetching async
Server Component that returns `null` when empty, reads its scope from request context (not props),
sizes via container queries (`@lg:`/`@2xl:`, portable across slots), uses DAWN tokens only, and is
metadata-declared + route-scoped (never leaks across routes; locked by `lib/widgets/modules.test.ts`).

**Conversion = the §8.4 recipe** (Part A: adopt a shell; Part B: the 6 touch-points per section).
Prioritized batches, member-first:

| Batch | Scope | Notes |
|---|---|---|
| **C-P0** | reconcile drift (`/network/friends` renders `<PageModules>` but isn't in `MODULE_ROUTES`); audit reachability | ~0.5 day |
| **C-P1** | top member browse/stream: `/feed`, `/circles`, `/channels`, `/events`, `/people` | highest visibility; establishes the `x-search` facet seam |
| **C-P2** | `/vault`, `/outreach`, `/codes`, `/network/*`; then the `/broadcast` + `/library` coupled-view seams | clears the two documented skips |
| **C-P3** | the `/admin/*` long tail in 5 clusters (Marketing, CRM, Growth, Marketplace, Content/Ops) | ~90 pages; parallelizable; `admin-practices-*` is the exemplar |
| **C-P4** | shell-only adoption for the ~48 no-template leaf/editor pages | Part A only (editors/Studio/Puck stop here) |

**Block ↔ Loom:** a page block *is* an App with a `page` surface. The `LAYOUT_MODULES` catalog
becomes the Loom **Apps lane**; an interior-grid slot is where an instance lands; per-theme restyle
is free because blocks are token-clean. `PageModules({ spaceId })` already resolves layout per-space,
so per-tenant App arrangement is wired.

---

## 7. Pillar D — registry unification (collapse without breaking live systems)

The three registries become **thin adapters that derive their existing exported shape from `APPS`.**
No call-site changes on day one; each keeps its function signatures. This generalizes the seam
`lib/admin/entities/registry.ts` already uses (`surfacesFor`).

- `AdminModule` ← `APPS.filter(a => a.surfaces.editor).map(toAdminModule)` — `modulesFor` unchanged.
- `LAYOUT_MODULES` / `ROUTE_MODULE_IDS` ← derived from `APPS` (`page` surface + `route` scopes).
- `element-catalog` ← `APPS.filter(a => a.surfaces.element)` — `renderRegistryElement` unchanged.
- `EntitySurface` / `SpaceSurface` ← re-expressed over `APPS`, the two gate paths unified into
  one `AppGate`.

**Guarded by tests before any deletion:** a superset conformance test (every existing id ↔ exactly
one App), a `LAYOUT_MODULES` order snapshot (feeds default render order), the `element:<reg>/<name>`
↔ `config:{registry,name}` round-trip (or live elements 404), parked-App-offered-nowhere, and a
gate-parity test that `appGatePasses` reproduces `modulesFor` / `spaceFunctionAccess` exactly on
today's data. An adapter is deleted only when its last importer is gone — collapsing them is cleanup,
not a blocker.

**One role resolver** (`lib/apps/access.ts`, pure, no IO):

```ts
export function appGatePasses(gate: AppGate, v: AppViewer): boolean {
  switch (gate.system) {
    case 'none':          return true
    case 'capability':    return v.caps.has(gate.capability)
    case 'spaceFunction': return v.canUseSpaceFn?.(gate.fn) ?? false  // fail-closed
    case 'staff':         return v.isStaff === true
  }
}
```

The server seam fills `AppViewer` once per request (community + Space worlds); the resolver never
touches IO. **view** = the App's own gate; **edit** (Layer 2/3/4 in Loom) = a higher `app.manage`
bar; **apply** (place an instance) = the surface owner's manage capability. Fail-closed end to end;
every App's server action re-checks the **same** gate before mutating (UX on the client, law on the
server).

---

## 8. Persistence & RLS

**Reuse aggressively; add exactly one table.** The Loom already ships the primitives.

| Need | Decision | Rationale |
|---|---|---|
| **App definitions** | code manifest (`lib/apps/catalog.ts` + `bindings.tsx`) | definitions are code; adding a type is a deploy, adding an instance/config is data |
| **Installed App + global config (Layer 2)** | **reuse `library_assets kind='app'`** — one row per (space, app), `config = { manifestKey, globalConfig, enabled }`; **root space = platform default**, a per-space row = that space's fork (`parent_id`) | Apps become Loom citizens: space-scoping, fork-on-edit, search, collections, RLS phasing all come free. Root-as-default resolves the "which space owns the default" question without a nullable column |
| **Global-config history** | **reuse `library_versions`** (snapshot + `is_current` + rollback) | non-destructive versioning already exists |
| **Instances (Layer 3)** | **NEW `public.app_instances`** (`id` = the layout slot's `block_id`, `space_id`, `app_asset_id`, `manifest_key`, `surface_type`, `surface_ref`, `slot`, `position`, `config` override, `status`) | high-cardinality, render-critical, queryable for usage/safe-delete. `page_settings.layout` stays the **placement/order/role-gate** authority; the instance row holds the **config payload**. One writer per concern |
| **Usage / xref** | **reuse `library_usages`** — add `'app_surface'` to `context` | "used on N surfaces," safe-uninstall, global swap already live here |
| **Style (Layer 4)** | **reuse `library_styles`** + `kind='theme'`/`token` config; per-instance `style_override` | tokens already persisted; per-theme resolution exists |
| **New lanes (fonts/tokens/copy)** | **reuse `library_assets`** — widen the `kind` check constraint + a `config` convention | the catalog was built polymorphic for exactly this (ADR-478) |

*Rejected:* a dedicated `app_configs` table (duplicates the Loom's space-scoping/versioning/
fork-on-edit) and instance-config-inside-layout-jsonb (unqueryable, bloats the world-readable row,
breaks the one-writer rule).

**RLS — fail-closed, phased** (mirrors how `library_*` and `page_settings` shipped):

- **Phase 1 (now):** `app_instances` has RLS enabled, **no policy** → deny-by-default; all access via
  staff/owner-gated server actions on the admin client. Safe by construction.
- **Phase 2 (D5 tenancy, gated by FOUNDATION-HARDENING):** `AS RESTRICTIVE` read
  (`can_view_space_content(space_id)` **plus** a public-render read mirroring `space_content_tables`,
  because Apps render for anon) + write (`can_write_space_content(space_id)`, guarding old+new on
  UPDATE to block cross-space moves). The `surface_ref → space` linkage is validated server-side so an
  instance's `space_id` always equals the surface's owning space.

New capabilities in `lib/core/capabilities.ts`: `loom.manage`, `app.install`/`app.configure` (→
`can_write_space_content` authority), `app.place`, `app.view`.

---

## 9. Phased rollout

Proposed ADRs: **498** (the App contract) · **499** (`app_instances`, placement-vs-payload split) ·
**500** (Loom lane expansion) · **501** (standardized admin bar) · **502** (template-everywhere) ·
**503** (per-space client RLS for Apps/Loom) · **504** (ingest + backfill).

**Core now — the loop that proves the whole thing on one entity (Event):**

| ID | Task | ADR |
|---|---|---|
| **LP1** | **App contract & catalog** — `lib/apps/{catalog,bindings,access}.ts`; superset + gate-parity tests | 498 |
| ~~**LP2**~~ | ~~**Registry unification** — invert `AdminModule` / `LAYOUT_MODULES` / `element-catalog` to derive from `APPS`~~ **REJECTED (ADR-501).** LP1 shipped the derive-direction *code → catalog* (`APPS` is a read-only projection of the registries), matching the platform principle "code is source of truth, Loom indexes read-only". Inverting would couple the pure catalog to the render graph for no gain; there is no drift to fix (122 ids ↔ 122 bindings, symmetric). | 501 |
| **LP3** | **Persistence** — `app_instances` migration + gated actions; reuse `library_assets kind='app'` / `library_versions` / `library_usages` / `page_settings`; RLS Phase 1 | 499/500 |
| **LP4** | **Standardized admin bar** — steps B0–B5; visibility = `appsForScope` non-empty; drill-down + search | 501 |
| **LP5** | **Loom Apps lane** — `kind='app'` in Loom Studio: read-only source + version (L1), editable config/connections/gate (L2), instances (L3), style (L4); the "Used in" help index | 500 |
| **LP-EVENT** | **Event, end-to-end** — build its full 9-spine as real Apps (Place&Time, People, Engage are the 🔴 gaps); the reference other entities copy | 441 |

**Full suite later:**

| ID | Task | ADR |
|---|---|---|
| **LP6** | **Loom lane expansion** — templates/flows, brand/icons/files (light); read-only index lanes for Themes + Email; defer fonts/media/copy/connections | 500 |
| **LP7** | **Template-everywhere** — batches C-P1→C-P4 (member browse/stream → coupled-view seams → `/admin/*` clusters → shell-only cleanup) | 502 |
| **LP8** | **Per-space + personal Looms + client RLS** — the D5 tenancy phase; `SPACE_FUNCTIONS` `library` key; community `library.*` caps. **Gated by hardening.** | 503 |
| **LP9** | **Ingest / backfill** — modules→Apps, layout placements→instances, theme/accent→lanes; idempotent, fail-safe, readers stay default-on-error | 504 |

**Dependency order:** LP1 → LP3 → LP4/LP5 ship the core loop (LP2 rejected, ADR-501); **LP-EVENT** rides on them as
the reference; **LP7** (template-everywhere) is parallelizable after LP1; **LP8** waits on
FOUNDATION-HARDENING; **LP9** runs continuously once LP3 exists.

---

## 10. Guardrails (non-negotiable)

- 🔴 **The Puck-vs-module boundary (PAGE-FRAMEWORK §10) is absolute.** Apps are the module engine
  (authenticated in-app surfaces). They are **not** Puck blocks (public micro-sites, `public.pages`).
  The App catalog is never offered in the Puck editor; an App surface mounts only where
  `isModuleRoute` is true.
- 🔴 **No raw-source editing.** The Loom indexes Layer 1 read-only. "Globally editable functions"
  edits Layer 2 config only. The component/SVG/action is a git artifact, versioned by commit.
- 🔴 **Tokens-only styling.** Layer 4 is DAWN design tokens, never hardcoded hex. `style_override`
  accepts token keys, not colors. Anything Vera draws follows [LOOM-DESIGN-LANGUAGE.md](LOOM-DESIGN-LANGUAGE.md).
- 🔴 **Capabilities are UX on the client, law on the server.** Every App action re-checks its gate
  (the admin client bypasses RLS, so the action is the authority). Fail-closed everywhere.
- 🔴 **Voice canon on every label.** Every `App.label`/`description`/`config[].label` and any
  AI-generated App copy passes [NAMING.md](NAMING.md) + [CONTENT-VOICE.md](CONTENT-VOICE.md) §10
  (no em dashes, locked nouns).

---

## 11. Open decisions (carried)

1. **App-override table key** — reuse the `page_chrome_overrides` route-keyed pattern vs a
   Loom-style space-scoped table keyed `(scope, appId)`. The Loom analogy argues space-scoped.
   Decide at LP4/B6.
2. **Space gate as a second axis** — `App.gate` is a discriminated union (`capability` |
   `spaceFunction` | `staff` | `none`); confirm `appsForScope` takes both a `caps` set and a
   `canUse(fn)` predicate (one polymorphic entry vs two typed ones). Decide at LP1.
3. **`@admin` server slot (EM3-2)** — ship the drill-down over the current client path first,
   RSC-compose the App bodies later. Confirm the sequencing.
4. **Inline vs sidebar surfaces** — the bar standardizes the **sidebar** surface; inline edit
   handles (`?edit=1`) stay the co-equal "tune on the page" surface. Does the bar also host
   launchers that deep-link into inline edit mode? Decide at LP4.
5. **Personal Loom scope** — how far member-owned Apps/assets go in v1 vs waiting for LP8.

---

*Owner: Daniel (Vision Steward). Synthesized 2026-07-02 from a five-track design fan-out. A named
development track; it does not replace LIBRARY.md (canonical for the DAM), PAGE-FRAMEWORK.md
(canonical for templates/modules), or ROLES.md (canonical for the role axes). Docs route per
DOCS-PROTOCOL.md: this spec + ADR-498…504 → git; operator behavior → the Notion training DB.*
