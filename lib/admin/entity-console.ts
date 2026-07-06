// THE shared core-entity /manage console resolution (admin-menu standardization). The one PURE seam the
// core-entity owner consoles (/{entity}/[id]/manage for circle · hub · nexus · practice) render from, so
// the two owner surfaces for a core entity can never drift on WHICH modules they show:
//
//   • the /manage CONSOLE (a client boundary): EntityManageConsole calls `resolveEntityConsole` and renders
//     each resolved module in spine order (components/admin/modules/entity-manage-console.tsx).
//   • the standardized admin RAIL (settings-panel.tsx): `settingsAppsFor` calls `appsForScope(scope, viewer,
//     'editor')` — the SAME resolver — so the rail's manage lane IS this same module set.
//
// This is the core-entity TWIN of `resolveSpaceMenu` (lib/admin/modules/space-menu.ts) for the Space menu.
// It replaces the thin legacy `ENTITY_SURFACES` registry (retired): that surfaced only Basics + Danger per
// entity, so a circle's rail showed ~7 modules while its /manage console showed 2. Both surfaces now derive
// from the ONE App catalog (lib/apps/catalog.ts, ← ADMIN_MODULES), gated identically, so the console shows
// the SAME modules the rail shows for the scope. entity-console.test.ts locks the two to the same set.
//
// PURE + framework-free (it only wraps the pure `appsForScope`), so it is safe to import on client + server
// and trivially testable.

import { appsForScope } from '@/lib/apps/for-scope'
import type { AdminScope } from '@/lib/layout/page-chrome'
import type { App, AppViewer } from '@/lib/apps/types'

/**
 * THE editor (manage) modules a core-entity /manage console renders for a page `scope` + `viewer`, in
 * catalog order — exactly the set the standardized rail resolves for the same scope (`appsForScope(scope,
 * viewer, 'editor')`). A core-entity module is `render: 'inline'`, so the console mounts its editor
 * component; the one seam is shared so the console + rail can never disagree on the module set. Fail-closed:
 * a null scope or null viewer yields [] (delegated to `appsForScope`). PURE.
 */
export function resolveEntityConsole(scope: AdminScope | null, viewer: AppViewer): App[] {
  return appsForScope(scope, viewer, 'editor')
}
