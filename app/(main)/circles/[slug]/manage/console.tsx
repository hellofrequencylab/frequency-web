'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import type { EntitySurface } from '@/lib/admin/entities/registry'

// The render boundary for the circle owner console (ADR-441 EM1-2). The page (an RSC)
// resolves the circle + gate server-side and hands this the registry surfaces it should
// show; this client layer binds each surface id to its component. This mirrors the admin
// module-map (ADR-250): the registry stays pure metadata, the binding lives here, so
// adding a surface is a registry row + one entry below, never a console-layout change.
//
// GROUNDING NOTE: today's CircleSettingsModule already renders BOTH the Basics form
// AND its own DangerDelete control (it is the circle's complete management surface as
// shipped on /circles/[slug]). So the Basics surface renders the module, and the Danger
// surface renders ONLY its section heading — the delete control it declares is served by
// the basics module's embedded DangerDelete (no duplicate destructive button). When the
// editing-system split (ADR-450) extracts a form-only Basics + a standalone Danger
// section, the Danger binding below gains its own DangerDelete with no page change.

/** Bind a surface id to the component that renders its body (null = served inline by a
 *  sibling surface today; see the grounding note above). */
const SURFACE_BODY: Record<string, (() => React.ReactNode) | null> = {
  'circle.basics': () => <CircleSettingsModule />,
  'circle.danger': null, // served by the basics module's embedded DangerDelete (ADR-450 will split it out)
}

export function CircleManageConsole({ surfaces }: { surfaces: EntitySurface[] }) {
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
