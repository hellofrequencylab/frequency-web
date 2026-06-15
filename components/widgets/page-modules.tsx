import { Suspense } from 'react'
import type { CommunityRole } from '@/lib/core/roles'
import { loadLayoutForRoute } from '@/lib/page-settings/store'
import { resolveModuleIds, applyRoleGate } from '@/lib/page-settings/layout'
import { getViewerCommunityRole } from '@/lib/page-settings/viewer-role'
import { LAYOUT_MODULE_IDS } from '@/lib/widgets/modules'
import { componentFor } from '@/lib/widgets/registry'

// The renderer for the per-route module-assignment engine (ADR-270/271). Resolves which layout
// modules are assigned to a route across the SCOPE CASCADE (exact route → section → global,
// most-specific wins), drops any the viewer's role can't see (per-module gate), and renders the
// rest in order, each self-fetching RSC isolated in its own <Suspense> so a slow module never
// blocks the page or its siblings. Pass `role` to skip the viewer lookup (e.g. a page that
// already resolved it). Fail-safe by construction: loadLayoutForRoute returns an empty config on
// any error and an empty resolution renders nothing, so the host page stays clean.
export async function PageModules({ route, role }: { route: string; role?: CommunityRole }) {
  const config = await loadLayoutForRoute(route)
  const enabled = resolveModuleIds(config, LAYOUT_MODULE_IDS)
  if (enabled.length === 0) return null

  const viewerRole = role ?? (await getViewerCommunityRole())
  const ids = applyRoleGate(enabled, config, viewerRole)
  if (ids.length === 0) return null

  return (
    <div className="space-y-4">
      {ids.map((id) => {
        const Component = componentFor(id)
        if (!Component) return null
        return (
          <Suspense key={id} fallback={null}>
            <Component />
          </Suspense>
        )
      })}
    </div>
  )
}
