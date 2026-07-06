'use client'

import { usePathname } from 'next/navigation'
import { adminScopeFor } from '@/lib/layout/page-chrome'
import { groupIntoSpine } from '@/lib/admin/modules/spine'
import { resolveEntityConsole } from '@/lib/admin/entity-console'
import { hrefForEntitySurface } from '@/lib/admin/entity-surface-hrefs'
import { MODULE_COMPONENTS } from './module-map'
import { SurfaceLinkRow } from './surface-link-row'
import type { Capability } from '@/lib/core/capabilities'
import type { AppViewer } from '@/lib/apps/types'

// The render boundary for EVERY core-entity owner console (/{entity}/[id]/manage — circle · hub · nexus ·
// practice). The unified replacement for the five near-identical per-entity consoles that each rendered a
// thin two-row `ENTITY_SURFACES` registry (Basics + Danger only). It resolves the SAME module set the
// standardized rail shows for the scope — `resolveEntityConsole` wraps `appsForScope(scope, viewer,
// 'editor')`, the exact seam settings-panel's `settingsAppsFor` uses — so the console and the rail can
// never drift (entity-console.test.ts locks it). Modeled on the Space /manage console (a resolved module
// list rendered in place); the ONE difference is that a core-entity module is `render: 'inline'` (a
// self-contained editor that self-fetches + self-gates and renders its OWN header), so the console mounts
// the module's component in a card rather than a headerless link-row. A `link` module (none on a core
// entity today) draws a SurfaceLinkRow, mirroring the rail's own render decision.
//
// The page (a Server Component) resolves the entity + the viewer's REAL capabilities for its scope and
// hands them here as a plain `Capability[]` (serializable — an `App`'s Lucide `Icon` is a function and
// cannot cross the RSC→client boundary, so the client re-resolves from the caps). The scope is read from
// the live path (adminScopeFor), exactly as the rail + every inline module do. Each module re-gates
// server-side, so this render gate is UX and the module's own action stays the authority.
export function EntityManageConsole({ caps }: { caps: readonly Capability[] }) {
  const pathname = usePathname()
  const scope = adminScopeFor(pathname)
  const viewer: AppViewer = { caps: new Set(caps) }
  const apps = resolveEntityConsole(scope, viewer)
  const appById = new Map(apps.map((a) => [a.id, a]))

  // Order the resolved modules by the 9-category spine (drop-empty), preserving catalog order within a
  // slot — the same spine the rail groups by, so the console reads top-to-bottom Basics → … → Danger.
  const ordered = groupIntoSpine(apps.map((a) => ({ id: a.id, category: a.category }))).flatMap(
    (g) => g.appIds,
  )

  if (ordered.length === 0) return null

  return (
    <div className="space-y-6">
      {ordered.map((id) => {
        const app = appById.get(id)
        if (!app) return null
        // Mirror the rail's per-module render decision (settings-panel nodeForApp): a `link` module draws a
        // compact link-row out to its own page (resolved via hrefForEntitySurface); every other module is
        // `inline` and mounts its self-contained editor component. Fail-safe: an unresolved href / missing
        // component draws nothing rather than a dead row.
        if (app.surfaces.editor?.render === 'link') {
          const href = hrefForEntitySurface(id, scope)
          return href ? <SurfaceLinkRow key={id} app={app} href={href} /> : null
        }
        const Body = MODULE_COMPONENTS[id]
        return Body ? (
          <div key={id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <Body />
          </div>
        ) : null
      })}
    </div>
  )
}
