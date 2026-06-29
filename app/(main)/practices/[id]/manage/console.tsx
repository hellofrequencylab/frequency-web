'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { PracticeSettingsModule } from '@/components/admin/modules/practice-settings-module'
import type { EntitySurface } from '@/lib/admin/entities/registry'

// Render boundary for the practice owner console (ADR-441 EM1-3). Mirrors the circle
// console: the page (an RSC) resolves the practice + gate server-side and hands this the
// registry surfaces to show; this client layer binds each surface id to its component.
//
// GROUNDING NOTE: today's PracticeSettingsModule already renders BOTH the Basics form
// AND its own embedded DangerDelete (deleteOwnPracticeAction). So Basics renders the
// module and Danger renders ONLY its section heading — the delete control it declares is
// served by the basics module's embedded DangerDelete (no duplicate destructive button),
// exactly like circle. When the editing-system split (ADR-450) extracts a standalone
// Danger section, the Danger binding below gains its own control with no page change.

const SURFACE_BODY: Record<string, (() => React.ReactNode) | null> = {
  'practice.basics': () => <PracticeSettingsModule />,
  'practice.danger': null, // served by the basics module's embedded DangerDelete
}

export function PracticeManageConsole({ surfaces }: { surfaces: EntitySurface[] }) {
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
