// THE shared Space-menu resolution (docs/MODULAR-MENU.md — P1/P3, ADR-544/546). The one PURE function
// that resolves "which modules the Space menu shows, gated + hidden + ordered", so the two owner surfaces
// that render the Space menu can never drift on the module set or its gating:
//
//   • the /manage CONSOLE (an RSC): SpaceManageBoard calls `resolveSpaceMenu` directly, then GROUPS the
//     result into its 7 member-facing clusters (console.tsx).
//   • the standardized admin RAIL (a client component): renders from the App catalog, whose Space lane
//     (lib/apps/catalog.ts SPACE_EDITOR_APPS) is derived 1:1 from the SAME SPACE_MODULES catalog and gated
//     by the SAME per-viewer function set (lib/spaces/functions.ts `usableSpaceFunctions`, carried on the
//     Customize trigger as `spaceFns`). space-menu.test.ts locks the two derivations to the same module set.
//
// The two surfaces intentionally GROUP + ORDER differently (the console folds 7 clusters by `slot`; the
// rail keeps per-slot tier bands), so this resolver returns the FLAT gated list and each surface groups it
// its own way. It is the single home for the gating rule alone.
//
// PURE + framework-free (data only), so it is trivially testable and safe to import anywhere.

import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import {
  spaceModuleManifest,
  type SpaceModule,
  type ModuleManifestOptions,
} from './space-modules'

/** The authoritative per-viewer gate for the Space menu, resolved server-side once and shared by both
 *  owner surfaces (the console passes it here; the rail's trigger passes the same inputs as `spaceFns`). */
export interface SpaceMenuGate {
  /** May this viewer use the given per-Space function? (A staff previewer sees all — see
   *  `usableSpaceFunctions`.) Drives every SERVICE module's gate. */
  canUse: (fn: SpaceFunctionKey) => boolean
  /** May this viewer manage the menu itself (owner / admin, `caps.canManageMembers`)? Gates ONLY the
   *  Module Manager entry (`space.modules`) — a mere editor / staff previewer never sees it. */
  canManageMenu: boolean
}

/**
 * THE gated, hidden-filtered, ordered Space menu module list (docs/MODULAR-MENU.md — P1, ADR-544). Takes
 * the full catalog (entitlements `{}` = default-on, so `spaceModuleManifest` applies ONLY the owner's
 * hide + order overrides), then gates each module by the authoritative per-viewer rule:
 *   - a SERVICE module (`gate.kind === 'feature'`) shows iff `gate.canUse(fn)`;
 *   - a SHELL module (`gate.kind === 'always'`) always shows, EXCEPT the Module Manager (`space.modules`),
 *     which needs `gate.canManageMenu` (owner/admin), matching the console's narrower gate.
 * Behavior-identical to the prior inline manage-board filter it replaces. PURE.
 */
export function resolveSpaceMenu(
  gate: SpaceMenuGate,
  menu: ModuleManifestOptions = {},
): SpaceModule[] {
  return spaceModuleManifest({}, { order: menu.order, hidden: menu.hidden }).filter((m) => {
    if (m.id === 'space.modules') return gate.canManageMenu
    return m.gate.kind === 'always' || gate.canUse(m.gate.fn)
  })
}
