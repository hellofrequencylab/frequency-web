# The Expansion Framework: how to add a vertical or a Space without touching the core

> **The promise, in one line.** Adding a new **vertical** (a capability like Marketplace or
> Store) or a new **Space** (a white-label sub-brand tenant) is **registering a descriptor in
> one place** — never editing the shell, the nav, the rail, the admin dock, or the capability
> resolver by hand.
>
> Status: **strategy / decision doc.** Canonical record: [ADR-250](DECISIONS.md). Operationalizes
> ADR-033 (module registry), ADR-248 (vertical recipe), ADR-249 ([Spaces](SPACES.md)). Authority
> order unchanged: running code + `supabase/migrations/` > this doc.

Status legend: ✅ load-bearing · ⏳ data-shaped but not yet composed · 🔴 hand-wired / not built.

---

## 0. The two axes of growth

| Axis | What it adds | Unit | Example |
|---|---|---|---|
| **Vertical** (down) | a new capability the platform offers | a **module** declared to the registry | Marketplace, Store, Practitioners, Events Listings |
| **Lateral** (across) | a new branded tenant that turns chosen capabilities on | a **Space** ([SPACES.md](SPACES.md)) | a practitioner site, a business with loyalty, Hook |

They are **orthogonal and they share one registry.** A vertical declares *what a capability is*;
a Space declares *which verticals are on, under whose brand*. Get the registry right once and both
axes become configuration.

---

## 1. The one rule

> **A vertical is a self-contained module that DECLARES itself to a registry. The core
> (shell, nav, rail, admin dock, capability resolver, engagement ledger) reads the registry;
> it is never edited to add a vertical.**

Everything below is the machinery that makes that rule literally true.

---

## 2. The vertical descriptor (register in one place)

Every vertical ships as one descriptor in `lib/verticals/<name>.ts`, registered from the single
index `lib/verticals/index.ts`. The descriptor is the entire public surface of the vertical:

```
Vertical = {
  id            // 'market' | 'store' | 'practitioner' | …
  entity        // 'foundation' | 'labs' | 'partner'   (the money partition, PLATFORM-VISION §1)
  nav?          // a NavArea + icon → merged into NAV_AREAS (no edit to nav-areas.ts)
  adminModules? // AdminModule[]    → merged into ADMIN_MODULES (the page admin dock renders them)
  railPanels?   // Widget[]         → merged into the rail WidgetSlot registry
  capabilities? // [{ scopeKind, resolve }] → composed into the capability resolver
  engagement?   // { source, eventTypes, verify?, toTrustSignal? } → a source adapter on the ledger
}
```

| Field | Feeds | So you never hand-edit |
|---|---|---|
| `nav` | `lib/nav-areas.ts` + `components/layout/nav-icons.ts` | the shell's nav config + icon map |
| `adminModules` | `lib/admin/modules/registry.ts` (`ADMIN_MODULES`) | `page-admin-bar.tsx`'s pathname dispatch |
| `railPanels` | the rail widget registry (`lib/layout/rail-panels.ts`) | `right-sidebar.tsx`'s panel switch |
| `capabilities` | `lib/core/capabilities.ts` resolver composition | the closed `Capability` union + `switch` |
| `engagement` | `lib/engagement/events.ts` (`recordEngagementEvent`) + `trust_signals` (ADR-247) | scattered inline `processGamificationEvent` calls |

**Data namespacing (unchanged from ADR-248):** own tables prefixed (`market_*`, `store_*`,
`practitioner_*`), touching core only by FK + an `entity` tag; reads via `SECURITY DEFINER` RPCs
returning contract view-models + capability sets, so web, mobile, and Hook call the identical RPC;
money (if any) only through `financial_transactions`.

**Definition of done for a vertical** = a descriptor + its namespaced tables/RPCs + tests, and
**zero diffs** to the shell, nav config, rail switch, admin bar, or the capability core.

---

## 3. The Space descriptor (lateral)

A Space ([SPACES.md](SPACES.md)) is a `spaces` row, not code:

```
Space = {
  id, type, name, skin, domain,
  entity,              // its money partition
  network_connected,   // the switch into the shared network
  enabled_verticals[]  // which registered modules are on for this tenant
}
```

Adding a sub-brand = inserting a `spaces` row that selects already-registered verticals, scoped by
`space_id` + RLS, rendered under its `[data-skin]`. **No new code per sub-brand.**

---

## 4. The seams today (what's real vs hand-wired)

The good bones exist; four composition points are still hand-authored. This is the activation gap
(BASELINE-ASSESSMENT, ADR-248), with exact locations:

| Seam | State | Where | Gap to close |
|---|---|---|---|
| Capability policy core | ✅ | `lib/core/capabilities.ts` `resolveCapabilities` (pure) | stays closed; verticals extend via the registry below |
| Admin module catalog + filter | ✅ | `lib/admin/modules/registry.ts` `modulesFor` / `modulesForScopeKind` | the dock now renders from it (step 1) |
| Nav as data | ✅ | `lib/nav-areas.ts` `NAV_AREAS` composes `verticalNavPlacements()` | a vertical's nav comes from its descriptor (step 4); the icon stays in the icon map by design (nav-areas is icon-free) |
| Admin nav as data | ✅ | `app/(main)/admin/sections.ts` `ADMIN_GROUPS` | module-contributed admin links |
| Engagement ledger | ✅ | `lib/engagement/events.ts` `recordEngagementEvent` (append-only, idempotent) | a `SourceAdapter` front door + trust-signal hook (step 5) |
| **Page admin dock** | ✅ | `components/layout/page-admin-bar.tsx` selects via `modulesForScopeKind` + an id→component map | done (step 1) |
| **Right rail** | ✅ | `components/sidebar/rail-registry.tsx` `RAIL_PANELS` WidgetSlot; `right-sidebar.tsx` maps it | done (step 2) |
| **Capability union** | ✅ | core stays closed; `lib/verticals` resolves namespaced module capabilities | done (step 3) |
| **Vertical registry** | ✅ | `lib/verticals/registry.ts` descriptor + selectors; Marketplace migrated | done (step 4) |
| **Engagement emission** | 🔴 | ~15 action files call `processGamificationEvent` inline | route through `recordEngagementEvent` via adapters (step 5) |
| **Spaces / skin** | ⏳ | `spaces` table (applied) + `lib/spaces` resolver; `(main)` layout resolves the active Space → `data-skin` on the shell root | remaining: per-skin token sets (DAWN), custom-domain content-routing, `space_members`, per-Space `space_id` RLS on new vertical tables |

**Marketplace is the cautionary example:** it exists (`lib/marketplace.ts`, `app/(main)/market/`,
nav key `market`) but is hand-wired at *every* seam — no admin module, no capability, no rail panel,
no engagement hook. It is exactly the accretion this framework prevents, so it is the **first
migration target**: move its wiring into `lib/verticals/market.ts` as the worked example.

---

## 5. The activation sequence (do this before any new vertical or Space)

Each step is independently shippable; later steps depend on earlier ones. This is the gating order
ADR-248/249 require — build a vertical or Space before the registry is load-bearing and it accretes
hand-wiring, defeating the framework.

1. ✅ **Wire the admin dock to the registry.** `page-admin-bar.tsx` selects modules via
   `modulesForScopeKind` (client surface, no resolved caps; each module re-gates server-side) + an
   id→component map at the render boundary (keeps the catalog pure). Replaces the pathname regex.
2. ✅ **Generalize the rail switch into a `WidgetSlot` registry** — `components/sidebar/rail-registry.tsx`
   `RAIL_PANELS` ({ needsCircles, gate, render }); `right-sidebar.tsx` maps it instead of branching.
3. ✅ **Make capabilities extensible** — the core resolver stays pure and closed; `lib/verticals`
   resolves namespaced module capabilities for a vertical's own scope kind, unioned across verticals.
4. ✅ **`lib/verticals/registry.ts` + `index.ts`** — the `Vertical` descriptor + static `VERTICALS`
   + selectors. **Marketplace migrated** to `lib/verticals/market.ts`; `NAV_AREAS` now composes its
   nav at the anchored position. A descriptor-contract test enforces the §6 guardrail in CI.
5. 🔴 **Engagement/trust source-adapter front door** — formalize `SourceAdapter`; route emissions
   through `recordEngagementEvent`; add the `trust_signals` ledger + projection (ADR-247) so each
   vertical emits trust from day one.
6. ⏳ **The Space layer (lateral)** — ✅ the `spaces` table (applied) + `lib/spaces` resolver +
   the spaces↔verticals join, and the `(main)` layout resolves the active Space (by host, root
   fallback) → `data-skin` on the shell root **and** hides vertical nav the Space hasn't switched
   on (via `activeVerticalsForSpace` → `navAccess`; a no-op for the root space). Remaining:
   per-skin token sets (DAWN), custom-domain content-routing, `space_members`, and per-Space
   `space_id` RLS on new vertical tables as they ship.

**Steps 1-4 are done — a vertical is now a descriptor.** After step 6, **a sub-brand is a row.**

---

## 6. The guardrails (so the contract can't quietly rot)

CI enforces the framework the way `check:authz` enforces the authz contract today. ✅ The
**descriptor-contract guardrail** is live as a test (`lib/verticals/registry.test.ts`): it fails the
build if a vertical's id isn't namespace-safe, its capabilities/engagement event-types aren't prefixed
with its id, its entity is unknown, or its declared nav doesn't compose into `NAV_AREAS`. The remaining
checks below are the follow-on:

- **No-core-edit check:** a `lib/verticals/*` descriptor may not be added in the same change that
  edits the shell/nav/rail/admin-bar/capability core, except the registry seams themselves.
- **Descriptor completeness:** a registered vertical with `entity !== shared` that emits money must
  reference `financial_transactions`; one that emits points must declare an `engagement.source`.
- **Namespacing:** new tables for a vertical must carry its prefix + an `entity` tag (lint/migration
  review).
- **The recipe checklist** (this doc §2 "definition of done") runs in the PR template for any vertical.

---

## 7. One-screen summary

- **Two axes, one registry:** verticals (capabilities) go *down*, Spaces (tenants) go *across*; both
  are declarations, not core edits.
- **A vertical = one descriptor** in `lib/verticals/<name>.ts` feeding nav, admin, rail, capabilities,
  and engagement/trust through the registry.
- **A Space = one `spaces` row** selecting registered verticals under a skin/domain/entity + the
  network switch.
- **The bones are real; four composition points are hand-wired.** The activation sequence (§5) closes
  them, with Marketplace as the first migration.
- **Sequence is law:** registry load-bearing → descriptor-per-vertical → Space-per-row. Guardrails in
  CI keep it honest.
