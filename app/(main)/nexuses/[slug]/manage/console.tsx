'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import type { EntitySurface } from '@/lib/admin/entities/registry'

// Render boundary for the nexus owner console (ADR-441 EM1-3). Mirrors the circle
// console: the page (an RSC) resolves the nexus + gate server-side and hands this the
// registry surfaces to show; this client layer binds each surface id to its component.
//
// GROUNDING NOTE: the nexus has no standalone destructive control yet (no deleteNexus
// action; the nexus settings module is edit-only). So Basics renders the settings
// module and Danger renders ONLY its section heading — header-only, like circle's
// Danger today. When nexus gains a delete action, the Danger binding below gains its
// DangerDelete with no page change. Flagged for follow-up (a delete action, not a
// schema change).

const SURFACE_BODY: Record<string, (() => React.ReactNode) | null> = {
  'nexus.basics': () => <NexusSettingsModule />,
  'nexus.danger': null, // no deleteNexus action yet — header-only (see grounding note)
}

export function NexusManageConsole({ surfaces }: { surfaces: EntitySurface[] }) {
  return (
    <>
      {surfaces.map((surface) => {
        const Body = SURFACE_BODY[surface.id]
        return (
          <section key={surface.id}>
            <SectionHeader title={surface.label} />
            <p className="-mt-2 mb-3 text-sm text-muted">{surface.desc}</p>
            {Body ? (
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                {Body()}
              </div>
            ) : null}
          </section>
        )
      })}
    </>
  )
}
