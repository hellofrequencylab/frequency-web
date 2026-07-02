'use client'

import type { AdminScope } from '@/lib/layout/page-chrome'
import type { Capability } from '@/lib/core/capabilities'
import { openAdminBar } from './open-admin-bar'

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
  label,
  icon,
  className,
}: {
  /** The scope to point the bar at (`id` = the entity's DB id). */
  scope?: AdminScope
  /** The viewer's caps already resolved for `scope` (the page passes `Array.from(entityCaps)`). */
  caps?: Capability[]
  /** The button label (voice canon: no em dashes). */
  label: string
  /** A pre-rendered icon element (e.g. `<Settings className="h-4 w-4" />`); crosses the RSC boundary
   *  as markup, so a Server Component page can pass it without a client-boundary trap. */
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => openAdminBar({ scope, caps })}
      className={className ?? DEFAULT_CLASS}
    >
      {icon}
      {label}
    </button>
  )
}
