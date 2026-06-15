import { Suspense } from 'react'
import { loadPageSettings } from '@/lib/page-settings/store'
import { parseLayout, resolveModuleIds } from '@/lib/page-settings/layout'
import { LAYOUT_MODULE_IDS } from '@/lib/widgets/modules'
import { componentFor } from '@/lib/widgets/registry'

// The renderer for the per-route module-assignment engine (ADR-270). Resolves which layout
// modules are assigned to a route (saved order minus the hidden set, merged over the registry
// defaults) and renders each self-fetching RSC in order, every one isolated in its own
// <Suspense> so a slow module never blocks the page or its siblings. Fail-safe by construction:
// loadPageSettings returns null on any error (incl. pre-migration), and an empty resolution
// renders nothing — so the host page stays clean.

export async function PageModules({ route }: { route: string }) {
  const row = await loadPageSettings(route)
  const ids = resolveModuleIds(parseLayout(row?.layout ?? null), LAYOUT_MODULE_IDS)
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
