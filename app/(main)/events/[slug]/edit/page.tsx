import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Copy } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { EventForm, type EventFormInitial } from '../../new/event-form'
import { CancelEventButton } from './cancel-event-button'
import { EventEditorWindow } from '@/components/studio/event/event-editor-window'

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
  cover_image_path: string | null
  gallery_image_paths: string[] | null
  recurrence_type: string | null
  recurrence_until: string | null
  venmo_handle: string | null
}

// A stored recurrence_until ISO -> the `YYYY-MM-DD` the date input wants (UTC date part).
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
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
        'energy_tag, attendance_mode, online_url, venue_name, street, city, region, postal_code, country, is_cancelled, cover_image_path, gallery_image_paths, recurrence_type, recurrence_until, venmo_handle',
    )
    .eq('slug', slug)
    .maybeSingle()
  // venmo_handle is newer than the generated DB types, so the typed select narrows to a
  // query error — read through unknown (repo convention for not-yet-regenerated columns).
  const ev = data as unknown as EventEditRow | null
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
    recurrenceType: (['daily', 'weekly', 'monthly'] as const).find((r) => r === ev.recurrence_type) ?? 'none',
    recurrenceUntil: toDateInput(ev.recurrence_until),
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
    coverImagePath: ev.cover_image_path ?? '',
    galleryImagePaths: ev.gallery_image_paths ?? [],
    venmoHandle: ev.venmo_handle ?? '',
  }

  return (
    <EventEditorWindow backHref={`/events/${slug}`}>
      <EventForm
        groups={[]}
        initial={initial}
        eventId={ev.id}
        currentScopeName={scopeName ?? undefined}
        backHref={`/events/${slug}`}
      />

      {/* Duplicate event — clone this event into a fresh, prefilled draft so a one-off can be
          repeated quickly. The create page re-checks the same edit capability on the source. */}
      <div className="mt-6 rounded-xl border border-border bg-surface-elevated/40 p-4">
        <p className="text-sm font-semibold text-text">Duplicate this event</p>
        <p className="mt-0.5 text-xs text-muted">
          Start a new event prefilled from this one. The date defaults to today so you can set the next one.
        </p>
        <div className="mt-3">
          <Link
            href={`/events/new?duplicate=${ev.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate event
          </Link>
        </div>
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
    </EventEditorWindow>
  )
}
