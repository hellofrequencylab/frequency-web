# The admin menu contract — one system, locked

**Status:** Locked 2026‑07‑06 (ADR‑553). This is the standard for the operator admin menu +
admin rail. It is **machine‑enforced** (`pnpm check:menu` + drift‑guard tests in CI), so it
can't be silently overwritten — including by an AI agent. Extend it; do not rewrite it.

## The one rule

**Every operator admin surface — the in‑page rail ("Customize" / Edit) AND the `/manage`
console, for every scope — derives its menu from ONE place: the module catalogs.** No surface
hand‑rolls its own list.

- **`SPACE_MODULES`** (`lib/admin/modules/space-modules.ts`) — the Space catalog (gated by
  `SpaceFunctionKey` + role).
- **`ADMIN_MODULES`** (`lib/admin/modules/registry.ts`) — the catalog for every other scope
  (circle, hub, nexus, event, practice, channel, journey, global/account; gated by `Capability`).
- **`LAYOUT_MODULES`** (`lib/widgets/modules.ts`) — the page/layout catalog (feeds `PAGE_APPS`).

These three `as const` arrays are the **only** module catalogs. Adding or changing a menu item =
editing a row in one of them. That is the "little tweak" path: safe, local, data‑only.

## How the surfaces resolve (never re‑implement these)

```
                         SPACE_MODULES / ADMIN_MODULES / LAYOUT_MODULES   (the catalogs)
                                              │
                     lib/apps/catalog.ts  →  APPS   (the one App contract)
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
   RAIL:  appsForScope(scope, viewer, kind)                    CONSOLE:  resolveSpaceMenu (space)
          (components/layout/settings-panel.tsx)                         resolveEntityConsole (others)
                                                                         (the /manage pages)
```

- The **rail** is `appsForScope` over `APPS` — one path for every scope. **Do not touch its render
  machinery** (`settings-panel.tsx`, `lib/apps/*`, `components/layout/admin-bar/*`) to add a menu
  item; add a catalog row instead.
- The **Space console** resolves via `resolveSpaceMenu` (`lib/admin/modules/space-menu.ts`).
- The **entity consoles** (circle/hub/nexus/practice) resolve via `resolveEntityConsole`
  (`lib/admin/entity-console.ts`) → the same `appsForScope` the rail uses, rendered by the shared
  `EntityManageConsole` (`components/admin/modules/entity-manage-console.tsx`).
- Event keeps its bespoke `/events/<slug>/manage` host dashboard (intentional; it is not a
  catalog surface).

## What is enforced, and how

1. **`pnpm check:menu`** (`scripts/check-menu.mjs`, CI step) — a static guard that FAILS a PR that
   (a) declares a new `*_MODULES` catalog outside the three source files, or (b) reintroduces a
   retired parallel registry (`SPACE_SURFACES` / `ENTITY_SURFACES`). Escape hatch: an inline
   `// menu-ok: <reason>` or an allowlist entry with a reason.
2. **Drift‑guard tests** (vitest, CI) — assert the console and rail resolve the **identical**
   module set per scope: `lib/admin/modules/space-menu.test.ts` (Space),
   `lib/admin/entity-console.test.ts` (circle/hub/nexus/practice). If a renderer diverges from the
   catalog, CI goes red.
3. **`AGENTS.md`** — instructs any agent to extend the catalog, never rewrite the renderers.

The static guard catches "someone hand‑rolled a new list"; the tests catch "the derivations
diverged." Together they are the belt‑and‑suspenders that keeps the standard from being overwritten.

## How to extend it (the supported ways)

- **Add / change a menu item:** edit the row in `SPACE_MODULES` or `ADMIN_MODULES` (label, icon,
  order, gate, group, `render`, `deepLink`). Both the rail and the console pick it up.
- **Add a scope:** register its modules in `ADMIN_MODULES` with `scopes: [...]`; the rail + console
  resolve it automatically. No new registry, no new renderer.
- **A genuinely new catalog** (rare): add it to the `check:menu` allowlist with a reason, and wire
  it into `APPS` (`lib/apps/catalog.ts`) so it flows through the one contract.

## Do not

- Do not hand‑roll a per‑scope menu array in a page/component.
- Do not reintroduce `ENTITY_SURFACES` / `SPACE_SURFACES` or any parallel "surfaces" registry.
- Do not add a menu item by editing the rail render (`settings-panel.tsx`) or a console page
  directly — edit the catalog.
- Do not rewrite the rail to "fix" a menu; the rail is the stable render, the catalog is the data.
