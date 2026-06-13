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
| Capability policy core | ✅ | `lib/core/capabilities.ts` `resolveCapabilities` (pure) | extend for module-contributed resolvers |
| Admin module catalog + filter | ⏳ | `lib/admin/modules/registry.ts` `modulesFor` (correct, **zero render consumers**) | the dock must render from it |
| Nav as data | ⏳ | `lib/nav-areas.ts` `NAV_AREAS` | icon map (`nav-icons.ts`) is a second hand-edit; let a descriptor carry both |
| Admin nav as data | ✅ | `app/(main)/admin/sections.ts` `ADMIN_GROUPS` | module-contributed admin links |
| Engagement ledger | ✅ | `lib/engagement/events.ts` `recordEngagementEvent` (append-only, idempotent) | a `SourceAdapter` front door + trust-signal hook |
| **Page admin dock** | 🔴 | `components/layout/page-admin-bar.tsx` dispatches by **pathname regex**, ignores `modulesFor` | render `modulesFor(scope, caps)` (the "@admin slot") |
| **Right rail** | 🔴 | `components/sidebar/right-sidebar.tsx` hardcoded `key === …` switch + `lib/layout/rail-panels.ts` union | generalize into a `WidgetSlot` registry (PAGE-FRAMEWORK §4.4) |
| **Capability union** | 🔴 | closed string union + one big `switch (scope.kind)` | a registry of per-scope resolvers a module joins |
| **Engagement emission** | 🔴 | ~15 action files call `processGamificationEvent` inline | route through `recordEngagementEvent` via adapters |
| **Spaces / skin** | 🔴 | none | `spaces` table + `space_id` RLS + `[data-skin]` resolver |

**Marketplace is the cautionary example:** it exists (`lib/marketplace.ts`, `app/(main)/market/`,
nav key `market`) but is hand-wired at *every* seam — no admin module, no capability, no rail panel,
no engagement hook. It is exactly the accretion this framework prevents, so it is the **first
migration target**: move its wiring into `lib/verticals/market.ts` as the worked example.

---

## 5. The activation sequence (do this before any new vertical or Space)

Each step is independently shippable; later steps depend on earlier ones. This is the gating order
ADR-248/249 require — build a vertical or Space before the registry is load-bearing and it accretes
hand-wiring, defeating the framework.

1. **Wire the admin dock to `modulesFor`** (highest leverage, smallest change). Add a `Component`
   reference to `AdminModule`; have `page-admin-bar.tsx` render `modulesFor(scope, caps)` instead of
   the pathname regex. Deletes the hardcoded imports + branch; makes `requiredCapability` actually
   gate. *This is the "@admin slot."*
2. **Generalize the rail switch into a `WidgetSlot` registry** — `{ id, slot, scopes, gate, Component }`;
   `right-sidebar.tsx` maps the slot instead of branching.
3. **Make the capability resolver extensible** — keep the built-in core, add a registry of per-scope
   resolver functions a module joins; `load-capabilities.ts` composes built-in + module results.
4. **Create `lib/verticals/registry.ts` + `index.ts`** — the single `registerVertical(v)` that feeds
   all four seams. **Migrate Marketplace into `lib/verticals/market.ts`** as proof.
5. **Engagement/trust source-adapter front door** — formalize `SourceAdapter`; route emissions
   through `recordEngagementEvent`; add the `trust_signals` ledger + projection (ADR-247) so each
   vertical emits trust from day one.
6. **The Space layer (lateral)** — `spaces` table + `space_id` RLS + `[data-skin]` resolver +
   `network_connected` switch + domain routing; a Space selects registered verticals.

After step 4, **a vertical = a descriptor.** After step 6, **a sub-brand = a row.**

---

## 6. The guardrails (so the contract can't quietly rot)

CI enforces the framework the way `check:authz` enforces the authz contract today:

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
