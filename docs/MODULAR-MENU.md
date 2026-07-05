# Modular menu system — the universal AdminModule program

**Goal.** One module contract drives the admin menu for EVERY scope (global, space, profile/account, circle, hub, nexus, event, practice, channel, journey). Each primary area or service is an independent, self-contained **module** with a header, a live snapshot, inline admin controls, and a wire into its deep-editing route. A **Module Manager** admin area lets an owner turn features/services on and off and order/hide the modules in their menu.

Naming/voice canon and the page framework apply to all module copy. Every phase = its own ADR + green gate (`tsc`, eslint, vitest, check:canon, check:authz) + PR, merged before the next.

## Where we start (the terrain)

Two parallel systems exist today:
1. **`lib/admin/modules/registry.ts` — `ADMIN_MODULES` + `modulesForScopeKind`.** The universal `AdminModule` contract. Covers 8 scopes: global, circle, hub, nexus, event, practice, channel, journey. Gates on `requiredCapability: Capability`.
2. **`lib/admin/entities/registry.ts` — `SPACE_SURFACES` / `ENTITY_SURFACES`.** The SPACE menu, separate. Space services (CRM, Members, Booking…) are `render:'link'` link-rows gated on `requiredFunction: SpaceFunctionKey` (space has NO `Capability` values — it uses `resolveSpaceManageAccess` + `spaceFunctionAccess` + `spaces.entitlements`). Space inline modules (basics/branding/settings/layout/autonomy/pipeline) render via `MODULE_COMPONENTS` keyed off SPACE_SURFACES metadata.

So "expand to every menu structure" = (a) generalize the `AdminModule` gate to accept a space feature key, (b) bring space onto the contract as first-class independent modules (services split, CRM consolidated), (c) add the Module Manager, (d) level up the other scopes to "full" modules, (e) retire the duplicate registry.

## The contract (v2)

Extend `AdminModule` (additive, all new fields optional so the 8 existing scopes are untouched):

```ts
interface AdminModule {
  // ...existing: id, label, desc, Icon, scopes, slot, surface, render, order, tier, priority, placement, surfaces
  requiredCapability?: Capability          // entity scopes (now optional)
  gate?: ModuleGate                        // NEW universal gate: { capability } | { spaceFunction } | { always }
  family?: ModuleFamily                    // 'space' | 'audience' | 'offerings' | 'reach' | 'growth' | 'system' | 'you'
  featureKey?: SpaceFunctionKey            // the toggle the Module Manager flips (space services)
  snapshotKey?: string                     // names a snapshot getter (0-3 live stats)
  primaryActions?: ModuleAction[]          // 1-2 top tasks
  deepLink?: (ctx) => string               // '/spaces/:slug/crm' — the full admin route
}
```

`moduleManifest(scope, caps, entitlements)` — the single resolver: returns the ordered, gated `AdminModule[]` for a scope, honoring the Module Manager's per-scope order/hidden overrides. Existing `modulesForScopeKind` becomes a thin caller of it.

## The full space module catalog (independent modules)

Family → modules (each gated by its featureKey; shows only when enabled):
- **space (shell, always on):** Identity & Branding · Info & Connect · Page · Settings · Danger
- **audience:** Members (`members`) · CRM (`crm`, absorbs Vera autonomy + Pipeline)
- **offerings (independent, per owner decision):** Booking (`availability`) · Memberships (`memberships`) · Donations (`donations`) · Enrollment (`enroll`) · Tickets (`tickets`) · Check-in (`checkin`) · Store (`services`)
- **reach:** QR Codes (`qr`) · Email (`email`)
- **growth:** Insights · Plan & Billing (`billing`)

## Phases

- **P0 — Contract v2 (foundation, additive, no render change).** Extend `AdminModule` with `gate` (capability | spaceFunction | always) + `family`/`featureKey`/`snapshotKey`/`primaryActions`/`deepLink`. Add `SPACE_MODULES: AdminModule[]` (the full independent catalog above, gated by featureKey) and `moduleManifest`. Unit tests prove the catalog covers every SPACE_FUNCTION + shell area and that gating matches today. Rail/console UNCHANGED. ADR-543.
- **P1 — Render the manage CONSOLE from the manifest + service split + CRM consolidation.** The `/manage` console renders space from `spaceModuleManifest` (gated by the authoritative `canUse`). Offerings un-merges into the 7 independent modules; CRM is one module. ADR-544. DONE.
- **P1b — Rail shows the independent modules.** The space rail renders through the `lib/apps` catalog (coupled to `SPACE_SURFACES`, `MODULE_COMPONENTS`, `surface-summaries`, `rail-bank`, `surface-hrefs` + their tests). Bring the rail to the same independent-module SET as the console by splitting the rail's surface source (`SPACE_SURFACES`): the merged Offerings row un-merges into the seven independent commerce surfaces (each gated on its own function), and the standalone autonomy/pipeline rows fold into a single CRM row — keeping every other scope's rail, and the rail's tier/placement, untouched. The full retarget onto `spaceModuleManifest` (and `SPACE_SURFACES` retirement) is P5. ADR-544b. DONE.
- **P2 — Full bodies + deep wiring for space services.** Each service module: on-page `?panel=` body + snapshot + "Open full …" deep link (much exists from D1-D5). ADR-545.
- **P3 — Module Manager admin area.** Owner-gated grid of every module: toggle feature (writes `spaces.entitlements`), drag-order, hide-from-menu, plan/tier badge + upgrade nudge. Persists `moduleOrder` + `hiddenModules` per space; the manifest reads them. Universal, ships space-first. ADR-546.
- **P4 — Other entity scopes to "full."** circle/hub/nexus/event/practice/channel/journey modules gain snapshots + deep links + the shared card via the contract. ADR-547.
- **P5 — Account/"You" + global onto the contract; retire duplication.** Personal set + global onto the manifest; delete legacy `ENTITY_SURFACES`/`SPACE_SURFACES` divergence; one renderer everywhere. Docs → git + Notion. ADR-548.

## Status
- [x] P0 · [x] P1 (console) · [x] P1b (rail) · [ ] P2 · [ ] P3 · [ ] P4 · [ ] P5
