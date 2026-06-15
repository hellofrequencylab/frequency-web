import { Suspense, type ReactNode } from 'react'
import type { CommunityRole } from '@/lib/core/roles'
import { loadLayoutForRoute } from '@/lib/page-settings/store'
import { resolveSlots } from '@/lib/page-settings/layout'
import { getViewerCommunityRole } from '@/lib/page-settings/viewer-role'
import { LAYOUT_MODULE_IDS } from '@/lib/widgets/modules'
import { componentFor } from '@/lib/widgets/registry'
import type { TemplateId } from '@/lib/widgets/templates'

// The renderer for the per-route module-assignment engine (ADR-270/271/272). Resolves the
// interior TEMPLATE + per-slot module ids for a route across the scope cascade (exact → section
// → global, most-specific wins), drops any a viewer's role can't see (per-module gate), and lays
// them out in the chosen template's grid — each self-fetching RSC isolated in its own <Suspense>
// so a slow module never blocks the page or its siblings. Pass `role` to skip the viewer lookup.
// Fail-safe by construction: loadLayoutForRoute returns an empty config on any error and an empty
// resolution renders nothing, so the host page stays clean.
export async function PageModules({ route, role }: { route: string; role?: CommunityRole }) {
  const config = await loadLayoutForRoute(route)
  const viewerRole = role ?? (await getViewerCommunityRole())
  const bySlot = resolveSlots(config, LAYOUT_MODULE_IDS, viewerRole)

  const total = Object.values(bySlot).reduce((n, ids) => n + ids.length, 0)
  if (total === 0) return null

  const slot = (id: string): ReactNode => {
    const ids = bySlot[id]
    if (!ids || ids.length === 0) return null
    return ids.map((moduleId) => {
      const Component = componentFor(moduleId)
      if (!Component) return null
      return (
        <Suspense key={moduleId} fallback={null}>
          <Component />
        </Suspense>
      )
    })
  }

  return <TemplateGrid template={config.template} slot={slot} />
}

// The interior grid per template. Each slot's contents stack with `space-y-4`; columns collapse
// to a single column on small screens. Adding a template = one case here + a meta entry in
// lib/widgets/templates.ts.
function TemplateGrid({ template, slot }: { template: TemplateId; slot: (id: string) => ReactNode }) {
  switch (template) {
    case 'main-side':
      return (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">{slot('main')}</div>
          <div className="space-y-4">{slot('side')}</div>
        </div>
      )
    case 'two-col':
      return (
        <div className="space-y-4">
          {slot('top')}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-4">{slot('col-1')}</div>
            <div className="space-y-4">{slot('col-2')}</div>
          </div>
        </div>
      )
    case 'three-col':
      return (
        <div className="space-y-4">
          {slot('top')}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-4">{slot('col-1')}</div>
            <div className="space-y-4">{slot('col-2')}</div>
            <div className="space-y-4">{slot('col-3')}</div>
          </div>
        </div>
      )
    default:
      return <div className="space-y-4">{slot('main')}</div>
  }
}
