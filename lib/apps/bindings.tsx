// The App component bindings (LP1 / ADR-498, docs/LOOM-PLATFORM.md §3) — the render boundary that turns
// an App id into its existing component, kept SEPARATE from the pure catalog (the registry.tsx
// discipline) so lib/apps/catalog.ts never pulls a React/Server Component. This file may import React
// and RSCs; catalog.ts / access.ts / adapters.ts / types.ts may not.
//
// It REUSES the three live render layers unchanged — nothing is rebuilt:
//   • editor  → MODULE_COMPONENTS   (components/admin/modules/module-map.tsx)
//   • page    → componentFor(id)    (lib/widgets/registry.tsx — the self-fetching RSC blocks)
//   • element → renderRegistryElement (lib/library/element-registry.tsx — the code-drawn SVG resolver)

import type { ComponentType, ReactElement, ReactNode } from 'react'
import { MODULE_COMPONENTS } from '@/components/admin/modules/module-map'
import { componentFor as layoutComponentFor } from '@/lib/widgets/registry'
import { renderRegistryElement } from '@/lib/library/element-registry'
import { appById } from './catalog'

/** A resolved binding for an App, discriminated by the surface it renders. */
export type AppBinding =
  | { kind: 'editor'; Component: ComponentType }
  | { kind: 'page'; Component: () => Promise<ReactElement | null> }
  | { kind: 'element'; render: () => ReactNode }

/**
 * The binding for an App id, or undefined when the id is unknown or its surface has no bound component.
 * Editor and page surfaces resolve to their existing component; an element surface resolves to a
 * renderer over `renderRegistryElement` (which returns null for an unknown registry/name).
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
    return { kind: 'element', render: () => renderRegistryElement(registry, name, pillar) }
  }

  return undefined
}
