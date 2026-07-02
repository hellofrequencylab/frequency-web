// The App component bindings (LP1 / ADR-502, docs/LOOM-PLATFORM.md §3) — the render boundary that turns
// an App id into its existing component, kept SEPARATE from the pure catalog (the registry.tsx
// discipline) so lib/apps/catalog.ts never pulls a React/Server Component. This file may import React
// and RSCs; catalog.ts / access.ts / adapters.ts / types.ts may not.
//
// It REUSES the three live render layers unchanged — nothing is rebuilt:
//   • editor  → MODULE_COMPONENTS   (components/admin/modules/module-map.tsx)
//   • page    → componentFor(id)    (lib/widgets/registry.tsx, the self-fetching RSC blocks)
//   • element → <ElementPreview/>   (a 'use client' wrapper over renderRegistryElement)
//
// The element branch must return a CLIENT node, not call renderRegistryElement directly:
// element-registry is a 'use client' module, so invoking it from this server-importable module would
// throw (the LP5b crash). We hand back <ElementPreview/> and let it render on the client, mirroring
// resolveAppPreview (lib/apps/app-registry.tsx).

import type { ComponentType, ReactElement, ReactNode } from 'react'
import { MODULE_COMPONENTS } from '@/components/admin/modules/module-map'
import { componentFor as layoutComponentFor } from '@/lib/widgets/registry'
import { ElementPreview } from '@/components/admin/library/element-preview'
import { appById } from './catalog'

/** A resolved binding for an App, discriminated by the surface it renders. */
export type AppBinding =
  | { kind: 'editor'; Component: ComponentType }
  | { kind: 'page'; Component: () => Promise<ReactElement | null> }
  | { kind: 'element'; render: () => ReactNode }

/**
 * The binding for an App id, or undefined when the id is unknown or its surface has no bound component.
 * Editor and page surfaces resolve to their existing component; an element surface resolves to a
 * renderer that returns the `<ElementPreview/>` client node (safe to build in a Server Component).
 */
export function componentFor(appId: string): AppBinding | undefined {
  const app = appById(appId)
  if (!app) return undefined

  if (app.surfaces.editor) {
    const Component = MODULE_COMPONENTS[app.id]
    return Component ? { kind: 'editor', Component } : undefined
  }

  if (app.surfaces.page) {
    const Component = layoutComponentFor(app.id)
    return Component ? { kind: 'page', Component } : undefined
  }

  if (app.surfaces.element) {
    const { registry, name, pillar } = app.surfaces.element
    return {
      kind: 'element',
      render: () => (
        <ElementPreview registry={registry} name={name} {...(pillar !== undefined ? { pillar } : {})} />
      ),
    }
  }

  return undefined
}
