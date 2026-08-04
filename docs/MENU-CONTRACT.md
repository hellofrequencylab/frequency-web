# The admin menu contract — one system, locked

**Status:** Locked 2026‑07‑06 (ADR‑553); **corrected 2026‑08‑04 (ADR‑927)** to describe what the code
actually does. This is the standard for the operator admin menu + admin rail. It is
**machine‑enforced** (`pnpm check:menu` + drift‑guard tests in CI), so it can't be silently
overwritten — including by an AI agent. Extend it; do not rewrite it.

> ⚠️ **What changed on 2026‑08‑04.** This doc used to claim three catalogs were the only module
> sources and that `check:menu` enforced it. Both were false. `APPS` composes **five** lanes from
> **four** registered catalogs plus one file‑local seed list, and **two per‑scope menus are hand‑declared
> in the rail** — which the old guard could not see, because it matched catalogs by the `*_MODULES`
> *name*. The guard has been rewritten to enforce the invariant by shape and structure, the real
> sources are listed below, and the hand‑declared menus are now **frozen debt** (§Frozen debt), not
> an unmentioned exception.

## The one rule

**Every operator admin surface — the in‑page rail ("Customize" / Edit) AND the `/manage`
console, for every scope — derives its menu from ONE place: the module catalogs.** No surface
hand‑rolls its own list. Said as the thing CI checks: **every menu row traces to a catalog row.**

## The registered catalogs (the only places a menu row is typed by hand)

| Catalog | File | Feeds | Gate |
| --- | --- | --- | --- |
| `SPACE_MODULES` | `lib/admin/modules/space-modules.ts` | the Space menu | `SpaceFunctionKey` + SpaceRole |
| `ADMIN_MODULES` | `lib/admin/modules/registry.ts` | every other scope (circle, hub, nexus, event, practice, channel, journey, global/account) | `Capability` |
| `LAYOUT_MODULES` | `lib/widgets/modules.ts` | the page/layout blocks (`PAGE_APPS`) | self‑gating blocks |
| `STUDIO_LEAVES` | `lib/nav/studio.ts` | the operator destinations (ADR‑848); `ADMIN_NAV` + `ADMIN_GROUPS` also derive from it | `web_role` staff axis |

Adding or changing a menu item = editing a row in one of these. That is the "little tweak" path:
safe, local, data‑only. `scripts/check-menu.mjs` holds the same list in `REGISTERED_CATALOGS`; the two
must agree, and CI fails if a registered catalog moves or stops exporting its symbol.

## How the surfaces resolve (never re‑implement these)

```
   SPACE_MODULES   ADMIN_MODULES   LAYOUT_MODULES   STUDIO_LEAVES   (ELEMENT_SEEDS ⚠️)
        │               │                │               │                │
        └───────────────┴──── lib/apps/catalog.ts ───────┴────────────────┘
                                    │
                            APPS  (the one App contract — FIVE lanes)
                                    │
          ┌─────────────────────────┴─────────────────────────┐
   RAIL:  appsForScope(scope, viewer, kind)          CONSOLE:  resolveSpaceMenu (space)
          (components/layout/settings-panel.tsx)               resolveEntityConsole (others)
                                                               (the /manage pages)
```

The five `APPS` lanes, and what each derives from — pinned in `APP_LANES` in `scripts/check-menu.mjs`,
so a sixth lane or a repointed lane fails the build until it is registered:

| Lane | Derives from | Status |
| --- | --- | --- |
| `EDITOR_APPS` | `ADMIN_MODULES` | ✅ registered catalog |
| `PAGE_APPS` | `LAYOUT_MODULES` | ✅ registered catalog |
| `SPACE_EDITOR_APPS` | `SPACE_MODULES` | ✅ registered catalog |
| `ADMIN_NAV_APPS` | `STUDIO_LEAVES` | ✅ registered catalog |
| `ELEMENT_APPS` | `ELEMENT_SEEDS` | ⚠️ a file‑local re‑declaration of `lib/library/element-catalog.ts`, drift‑guarded by `lib/apps/catalog.test.ts`. LP2 exports the source list and repoints the lane. |

- The **rail** is `appsForScope` over `APPS` — one path for every scope. **Do not touch its render
  machinery** (`settings-panel.tsx`, `lib/apps/*`, `components/layout/admin-bar/*`) to add a menu
  item; add a catalog row instead.
- The **Space console** resolves via `resolveSpaceMenu` (`lib/admin/modules/space-menu.ts`).
- The **entity consoles** (circle/hub/nexus/practice) resolve via `resolveEntityConsole`
  (`lib/admin/entity-console.ts`) → the same `appsForScope` the rail uses, rendered by the shared
  `EntityManageConsole` (`components/admin/modules/entity-manage-console.tsx`).
- **Route‑local hub sections are not catalogs.** The Space (`lib/admin/modules/space-hub.ts`), event
  (`app/(main)/events/[slug]/manage/hub.ts`, ADR‑828) and channel
  (`app/(main)/channels/[id]/manage/hub.ts`, ADR‑870) `?section=` registries are `{ key, label, blurb }`
  groupings over the catalogs, not module lists — they carry no destination and no renderer, and the
  guard's shape rule correctly ignores them. Each hub's Settings tab mounts the SAME catalog module the
  rail does; it never builds a parallel form.

## What is enforced, and how

**`pnpm check:menu`** (`scripts/check-menu.mjs`, CI step) enforces the invariant by **shape and
structure, not by name** — the old name‑only rule was satisfiable by renaming a variable:

| Rule | Scope | Fails when |
| --- | --- | --- |
| 1 · module‑catalog shape | repo‑wide, name‑blind | an array literal holds admin‑module‑shaped rows (a string‑literal `id`/`key` + ≥2 of `requiredCapability`/`deepLink`/`slot`/`render`/`surface`/`tier`/`placement`/`scopes`/`gate`) outside a registered catalog |
| 2 · legacy name floor | repo‑wide | a `const *_MODULES` outside the registered catalogs, or a retired registry (`SPACE_SURFACES` / `ENTITY_SURFACES`) returns |
| 3 · no hand‑declared menu | the menu‑resolution surface | a row with a string‑literal `label`/`title` plus a destination or renderer key is typed by hand — **ratcheted**: the per‑file count may hold or fall, never rise |
| 4 · the `APPS` lane manifest | `lib/apps/catalog.ts` | `APPS` composes an unregistered lane, a lane stops being a `<CATALOG>.map(...)` derivation, a lane is repointed, or a registered lane silently disappears |
| 5 · integrity | the guard itself | a registered catalog, a surface seed, or a frozen‑debt entry is moved, deleted, or stale — so the gate cannot be dodged by moving the thing it inspects |

The **menu‑resolution surface** (rule 3) is `components/layout/settings-panel.tsx`,
`components/layout/admin-bar/**`, `components/admin/modules/**`, `lib/apps/**`, `lib/admin/**`,
`lib/widgets/modules.ts`, **plus every `lib/` file those import directly** — so a hand‑rolled list
cannot escape by moving one file sideways. Two files the surface pulls in are classified `NOT_A_MENU`
with their real system named, never silently skipped: `lib/nav-areas.ts` (the **member** nav registry,
a different system per ADR‑868) and `lib/spotlight/theme.ts` (font stacks and theme presets).

**Drift‑guard tests** (vitest, CI) assert the console and rail resolve the **identical** module set per
scope: `lib/admin/modules/space-menu.test.ts` (Space), `lib/admin/entity-console.test.ts`
(circle/hub/nexus/practice). `scripts/check-menu.test.ts` locks the guard's own rules, including the
adversarial cases (rename the variable, move the list, add a lane).

**`AGENTS.md`** instructs any agent to extend the catalog, never rewrite the renderers.

### 🔴 What is NOT enforced

A hand‑rolled list declared **outside** the menu‑resolution surface **and** rendered directly by a page,
bypassing `APPS` and `appsForScope` entirely, is invisible to this guard. Widening the shape rule to all
of `app/**` produces dozens of false positives (filter chips, stat tiles, page tabs), which is a gate
nobody keeps. Green means "no menu row entered the admin rail or the consoles without a catalog row",
not "no page anywhere renders a list of links". The runtime drift‑guards cover the other half — "the
derivations diverged" — but only for the scopes they name.

## Frozen debt (⚠️ the contract is partly unenforced, on purpose and in the open)

Three hand‑declared menus exist today. They are **frozen, not forgiven**: `FROZEN_MENU_DEBT` in
`scripts/check-menu.mjs` records a per‑file row count that may **hold or fall, never rise**, and an entry
that falls to zero must be deleted (a stale entry fails the build, so the list cannot rot). Adding a row
to any of them fails CI exactly as a new hand‑rolled menu would.

| Site | Rows | Why it is still here | To retire it |
| --- | --- | --- | --- |
| `components/layout/settings-panel.tsx` — `allExtraItems` | 6 | Circle Quest, Page content, the Layout tuner (circle/event/practice) and the event Danger zone are mounted by hand into the rail. ADR‑886 already named this the wrong pattern ("Events mount `EventDangerZone` directly in `settings-panel.tsx` as an inline extra … `hub.danger`, `nexus.danger` and `journey.danger` all render from `ADMIN_MODULES` instead, and that is the pattern this follows"). | One `ADMIN_MODULES` row each, component moved into `MODULE_COMPONENTS`. **Owner call needed** on the three Layout rows: one component parameterised by page noun, gated on three different capabilities. |
| `lib/admin/rail-bank.ts` — `baseBank` | 11 | A `switch` over `scope.kind` returning literal quick‑link arrays for space / global+profile / circle / event / hub+nexus+practice / journey / channel. The second per‑scope menu ADR‑927 found. | Mint the rows with `placement: 'bank'` (ADR‑515 already designed the path; nothing opts in yet) and delete `baseBank`. **Owner call needed**: it changes which quick links each scope shows, and several hrefs are DB‑id‑keyed rather than slug‑keyed. |
| `components/admin/modules/channel-settings-module.tsx` | 4 | Four hand‑typed links to the Channel Manage hub sections, duplicating `CHANNEL_HUB_SECTIONS`. Inside a catalog module body, so the *row* traces to a catalog row — but the list can drift from the hub it mirrors. | Render them from `CHANNEL_HUB_SECTIONS`. Mechanical; no product decision. |

## How to extend it (the supported ways)

- **Add / change a menu item:** edit the row in `SPACE_MODULES` or `ADMIN_MODULES` (label, icon,
  order, gate, group, `render`, `deepLink`). Both the rail and the console pick it up.
- **Add a scope:** register its modules in `ADMIN_MODULES` with `scopes: [...]`; the rail + console
  resolve it automatically. No new registry, no new renderer.
- **A genuinely new catalog** (rare): add its file + exported symbol to `REGISTERED_CATALOGS`, add its
  lane to `APP_LANES` in `scripts/check-menu.mjs`, and wire it into `APPS` (`lib/apps/catalog.ts`) as a
  `<CATALOG>.map(...)` lane so it flows through the one contract. Update the tables above in the same pass.
- **Something the guard flags that genuinely is not a menu:** classify the file in `NOT_A_MENU` **naming
  the system it belongs to**, or put `// menu-ok: <reason>` on the declaration line. Never grow
  `FROZEN_MENU_DEBT` — that list only shrinks.

## Do not

- Do not hand‑roll a per‑scope menu array in a page/component — renaming the variable no longer helps.
- Do not reintroduce `ENTITY_SURFACES` / `SPACE_SURFACES` or any parallel "surfaces" registry.
- Do not add a menu item by editing the rail render (`settings-panel.tsx`) or a console page
  directly — edit the catalog.
- Do not rewrite the rail to "fix" a menu; the rail is the stable render, the catalog is the data.
- Do not raise a `FROZEN_MENU_DEBT` count to make a change fit. Migrate the site, or bring the product
  decision to the owner.
