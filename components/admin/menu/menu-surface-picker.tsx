'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { MenuSurfaceKey } from '@/lib/menus/types'
import { AdminSection } from '@/components/templates'

// The Surface picker — the client leaf of the `menu-surface` template block, and the ONLY thing
// that sets the active surface. Picking a surface navigates to `?surface=<key>` (a client
// router.push); the proxy stamps the query onto the `x-search` request header, and every
// surface-scoped block (menu-groups, menu-layout, menu-rail-cards) re-resolves the active surface
// through lib/menus/active-surface — so they all re-scope to the same surface in lock-step, exactly
// like /practices threads its facets to the practices-library module. A pending transition shows
// the re-scope is in flight.
export function MenuSurfacePicker({
  surfaces,
  active,
  defaults,
}: {
  /** All five surfaces with labels, in display order. */
  surfaces: { key: MenuSurfaceKey; label: string }[]
  /** The active surface (resolved server-side from the URL). */
  active: MenuSurfaceKey
  /** Which surfaces are still on the code defaults (no saved DB rows), keyed by surface. */
  defaults: Record<MenuSurfaceKey, boolean>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function pick(key: MenuSurfaceKey) {
    if (key === active) return
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('surface', key)
    // Scroll-preserving client navigation: the proxy re-stamps x-search and the
    // surface-scoped blocks re-fetch for the new surface.
    startTransition(() => router.push(`?${params.toString()}`, { scroll: false }))
  }

  return (
    <AdminSection
      title="Surface"
      description="Pick which menu to edit. Each surface keeps its own groups, links, and rail cards."
      actions={
        isPending ? (
          <span className="text-xs text-subtle" aria-live="polite">
            Switching surface…
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Menu surface">
        {surfaces.map((s) => {
          const isActive = s.key === active
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={isPending}
              onClick={() => pick(s.key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                isActive
                  ? 'border-primary bg-primary-bg text-primary-strong'
                  : 'border-border bg-surface text-muted hover:bg-surface-elevated hover:text-text'
              }`}
            >
              {s.label}
              {defaults[s.key] && (
                <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-xs font-semibold text-subtle">
                  Default
                </span>
              )}
            </button>
          )
        })}
      </div>
    </AdminSection>
  )
}
