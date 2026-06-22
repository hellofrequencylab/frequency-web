'use client'

import { useState } from 'react'
import type { MenuSettings, MenuSurfaceKey, ResolvedMenu } from '@/lib/menus/types'
import { AdminSection } from '@/components/templates'
import { SettingsPanel } from './settings-panel'
import { MenuEditor } from './menu-editor'

// The top-level Menu Manager client. Owns the surface picker (1) and the shared
// aria-live status line, mounts the global speed panel (2) once, and renders the
// active surface's editor. Every surface's ResolvedMenu is pre-loaded server-side
// (the page reads all five in parallel) so switching surfaces is instant and the
// editor stays a pure client component with no read action.
export function MenuManager({
  surfaces,
  menus,
  settings,
}: {
  /** All five surfaces with labels, in display order. */
  surfaces: { key: MenuSurfaceKey; label: string }[]
  /** The resolved menu per surface, keyed by surface key. */
  menus: Record<MenuSurfaceKey, ResolvedMenu>
  settings: MenuSettings
}) {
  const [active, setActive] = useState<MenuSurfaceKey>(surfaces[0]?.key ?? 'public_discover')
  const [status, setStatus] = useState<string>('')

  const activeSurface = surfaces.find((s) => s.key === active) ?? surfaces[0]
  const activeMenu = menus[active]

  return (
    <div className="space-y-8 lg:space-y-10">
      {/* Live status line — announced for assistive tech, visible to everyone. */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {/* Global speed settings (2) */}
      <AdminSection
        title="Open & dwell speed"
        description="Global timings for how every mega-menu opens, lingers, and fades."
      >
        <SettingsPanel initial={settings} />
      </AdminSection>

      {/* Surface picker (1) */}
      <AdminSection
        title="Surface"
        description="Pick which menu to edit. Each surface keeps its own groups, links, and rail cards."
        actions={
          status ? (
            <span className="text-xs text-subtle" aria-hidden>
              {status}
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Menu surface">
          {surfaces.map((s) => {
            const isActive = s.key === active
            const isDefault = menus[s.key]?.isDefault
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActive(s.key)
                  setStatus('')
                }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                {s.label}
                {isDefault && (
                  <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-xs font-semibold text-subtle">
                    Default
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </AdminSection>

      {/* The active surface editor — keyed so state resets cleanly on switch. */}
      {activeMenu && activeSurface && (
        <MenuEditor
          key={active}
          initialMenu={activeMenu}
          surfaceKey={active}
          surfaceLabel={activeSurface.label}
          onStatus={setStatus}
        />
      )}
    </div>
  )
}
