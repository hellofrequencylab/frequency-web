import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { FocusTemplate } from '@/components/templates'
import { EventForm, type EventFormInitial } from '../../new/event-form'
import { CancelEventButton } from './cancel-event-button'

// Edit an event's details — the host's (and any circle manager's / admin's) self-service editor.
// Gated by the same `event.editSettings` capability the admin editor + /manage use. Reuses the
// member EventForm (every field the create flow sets), prefilled, in edit mode.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit event' }

interface EventEditRow {
  id: string
  title: string | null
  description: string | null
  location: string | null
  scope_id: string | null
  starts_at: string | null
  ends_at: string | null
  capacity: number | null
  visibility: string | null
  category: string | null
  energy_tag: string | null
  attendance_mode: string | null
  online_url: string | null
  venue_name: string | null
  street: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  is_cancelled: boolean | null
}

// Event times are stored UTC-naive (the host's datetime-local value is kept as-is, rendered in
// UTC across reminders). Round-trip the stored timestamp back to a `YYYY-MM-DDTHH:mm` input by
// reading its UTC parts, so a save re-stores the same instant.
function toInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export default async function EditEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from('events')
    .select(
      'id, title, description, location, scope_id, starts_at, ends_at, capacity, visibility, category, ' +
        'energy_tag, attendance_mode, online_url, venue_name, street, city, region, postal_code, country, is_cancelled',
    )
    .eq('slug', slug)
    .maybeSingle()
  const ev = data as EventEditRow | null
  if (!ev) notFound()

  // Author / circle manager / community admin only (re-checked server-side in updateEvent too).
  const caps = await getEventCapabilities(ev.id)
  if (!caps.has('event.editSettings')) notFound()

  let scopeName: string | null = null
  if (ev.scope_id) {
    const { data: circle } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
    scopeName = (circle as { name: string } | null)?.name ?? null
  }

  const attendanceMode = (['in_person', 'online', 'hybrid'] as const).find((m) => m === ev.attendance_mode) ?? 'in_person'

  const initial: Partial<EventFormInitial> = {
    title: ev.title ?? '',
    description: ev.description ?? '',
    location: ev.location ?? '',
    scopeId: ev.scope_id ?? '',
    startsAt: toInput(ev.starts_at),
    endsAt: toInput(ev.ends_at),
    capacity: ev.capacity != null ? String(ev.capacity) : '',
    visibility: ev.visibility ?? 'circle_only',
    category: ev.category ?? 'gathering',
    energyTag: ev.energy_tag ?? '',
    attendanceMode,
    onlineUrl: ev.online_url ?? '',
    venueName: ev.venue_name ?? '',
    street: ev.street ?? '',
    city: ev.city ?? '',
    region: ev.region ?? '',
    postalCode: ev.postal_code ?? '',
    country: ev.country ?? '',
  }

  return (
    <FocusTemplate title="Edit event" back={{ href: `/events/${slug}`, label: 'Back to event' }}>
      <div className="rounded-xl border border-border bg-surface p-5">
        <EventForm
          groups={[]}
          initial={initial}
          eventId={ev.id}
          currentScopeName={scopeName ?? undefined}
          backHref={`/events/${slug}`}
        />
      </div>

      {!ev.is_cancelled && (
        <div className="mt-6 rounded-xl border border-danger/30 bg-danger-bg/30 p-4">
          <p className="text-sm font-semibold text-text">Cancel this event</p>
          <p className="mt-0.5 text-xs text-muted">
            Marks the event cancelled for everyone. Attendees keep their RSVP record but the event
            shows as cancelled.
          </p>
          <div className="mt-3">
            <CancelEventButton eventId={ev.id} slug={slug} title={ev.title ?? 'this event'} />
          </div>
        </div>
      )}
    </FocusTemplate>
  )
}
