'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import type { EntitySurface } from '@/lib/admin/entities/registry'

// Render boundary for the hub owner console (ADR-441 EM1-3). Mirrors the circle
// console (app/(main)/circles/[slug]/manage/console.tsx): the page (an RSC) resolves
// the hub + gate server-side and hands this the registry surfaces to show; this client
// layer binds each surface id to its component. Registry stays pure metadata; adding a
// surface is a registry row + one entry below, never a console-layout change.
//
// GROUNDING NOTE: the hub has no standalone destructive control yet (no deleteHub
// action; the hub settings module is edit-only). So Basics renders the settings module
// and Danger renders ONLY its section heading — header-only, exactly like circle's
// Danger today. When hub gains a delete action, the Danger binding below gains its
// DangerDelete with no page change. Flagged for follow-up (a delete action, not a
// schema change).

const SURFACE_BODY: Record<string, (() => React.ReactNode) | null> = {
  'hub.basics': () => <HubSettingsModule />,
  'hub.danger': null, // no deleteHub action yet — header-only (see grounding note)
}

export function HubManageConsole({ surfaces }: { surfaces: EntitySurface[] }) {
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
