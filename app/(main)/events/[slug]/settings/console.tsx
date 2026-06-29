'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteEvent } from '@/app/(main)/events/admin-actions'
import type { EntitySurface } from '@/lib/admin/entities/registry'

// Render boundary for the event SETTINGS console (ADR-441 EM1-3). Mirrors the circle
// console: the page (an RSC) resolves the event + gate server-side and hands this the
// registry surfaces to show; this client layer binds each surface id to its component.
//
// This is the registry-driven SETTINGS surface (Basics + Danger). It is distinct from
// the bespoke operator dashboard at /events/[slug]/manage (EVENTS-REWORK: roster,
// approvals, questionnaire, dispatches), which is NOT a registry console — so this lives
// at /events/[slug]/settings to avoid colliding with it.
//
// GROUNDING NOTE: unlike circle/practice, the event settings module does NOT embed a
// DangerDelete, but a `deleteEvent` action exists — so the Danger surface renders a real
// DangerDelete wired to it (gated server-side on event.editSettings, the same gate).

export function EventManageConsole({
  surfaces,
  eventId,
  slug,
}: {
  surfaces: EntitySurface[]
  eventId: string
  slug: string
}) {
  const SURFACE_BODY: Record<string, (() => React.ReactNode) | null> = {
    'event.basics': () => <EventSettingsModule />,
    'event.danger': () => (
      <DangerDelete
        entity="event"
        warning="Permanently removes this event. RSVPs and check-ins are cleared. If this event is part of a recurring series, only this occurrence is deleted. Once deleted it cannot be recovered."
        onDelete={() => deleteEvent(eventId, slug)}
        redirectTo="/events"
      />
    ),
  }

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
