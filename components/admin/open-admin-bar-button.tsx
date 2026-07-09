'use client'

import type { AdminScope } from '@/lib/layout/page-chrome'
import type { Capability } from '@/lib/core/capabilities'
import type { SpaceType } from '@/lib/spaces/types'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { openAdminBar, type OpenAdminBarModuleMenu } from './open-admin-bar'

// The ONE trigger for the standardized admin bar (docs/ADMIN-RAIL.md Phase 1). It collapses the former
// per-entity "Edit" buttons: a Server Component page renders this in a header actions slot with the
// entity's DB-id `scope` + the caps it already resolved, and clicking OPENS the bar pre-scoped (the
// typed `open-admin-bar` event carries scope + caps). With no scope/caps it is the plain open trigger.
// The default styling matches the entity edit buttons it replaced; pass `className` to override.

const DEFAULT_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated'

export function OpenAdminBarButton({
  scope,
  caps,
  spaceType,
  spaceFns,
  moduleMenu,
  label,
  icon,
  iconOnly,
  className,
}: {
  /** The scope to point the bar at (`id` = the entity's DB id). */
  scope?: AdminScope
  /** The viewer's caps already resolved for `scope` (the page passes `Array.from(entityCaps)`). */
  caps?: Capability[]
  /** For a `space` scope (ENTITY-MANAGEMENT / PR C): the Space's type + the per-Space functions this
   *  viewer may use, so the panel resolves the Space's editor Apps by type + function (not by Capability). */
  spaceType?: SpaceType
  spaceFns?: SpaceFunctionKey[]
  /** For a `space` scope (modular menu P3b): the owner's Module Manager menu overrides (order + hidden),
   *  so the RAIL honors hiding + reordering like the console. */
  moduleMenu?: OpenAdminBarModuleMenu
  /** The button label (voice canon: no em dashes). */
  label: string
  /** A pre-rendered icon element (e.g. `<Settings className="h-4 w-4" />`); crosses the RSC boundary
   *  as markup, so a Server Component page can pass it without a client-boundary trap. */
  icon?: React.ReactNode
  /** Render ONLY the icon (the compact mobile action band): the `label` becomes the accessible name
   *  (aria-label + sr-only text) instead of visible text, so the control stays reachable + labeled. */
  iconOnly?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => openAdminBar({ scope, caps, spaceType, spaceFns, moduleMenu })}
      aria-label={iconOnly ? label : undefined}
      className={className ?? DEFAULT_CLASS}
    >
      {icon}
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </button>
  )
}
