'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteEvent } from '@/app/(main)/events/admin-actions'

// The event SETTINGS console (ADR-441 EM1-3). This is the registry-driven Basics + Danger surface for an
// event, kept deliberately THIN and DISTINCT from the bespoke operator dashboard at /events/[slug]/manage
// (EVENTS-REWORK: roster, approvals, questionnaire, dispatches) — so it lives at /events/[slug]/settings
// and does not collide.
//
// It is intentionally NOT put on the shared unified EntityManageConsole, unlike circle / hub / nexus /
// practice (admin-menu standardization). The event scope's rail modules (Place & Time, People, Engage)
// would DUPLICATE the bespoke /manage dashboard's roster + approvals + ticketing, and the event delete is
// the `deleteEvent` action (not a catalog module), which the unified console would drop. So event keeps its
// own thin Basics + Danger console here. The only change vs. its prior shape is that it no longer reads the
// retired `ENTITY_SURFACES` registry — the two sections are composed directly, byte-identical output.
export function EventManageConsole({ eventId, slug }: { eventId: string; slug: string }) {
  return (
    <>
      <section>
        <SectionHeader title="Basics" />
        <p className="-mt-2 mb-3 text-sm text-muted">
          Title, description, cover, location, time, and permalink.
        </p>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <EventSettingsModule />
        </div>
      </section>

      <section>
        <SectionHeader title="Danger zone" />
        <p className="-mt-2 mb-3 text-sm text-muted">Delete this event. This cannot be undone.</p>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <DangerDelete
            entity="event"
            warning="Permanently removes this event. RSVPs and check-ins are cleared. If this event is part of a recurring series, only this occurrence is deleted. Once deleted it cannot be recovered."
            onDelete={() => deleteEvent(eventId, slug)}
            redirectTo="/events"
          />
        </div>
      </section>
    </>
  )
}
