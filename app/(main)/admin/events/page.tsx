import Link from 'next/link'
import { CalendarDays, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { CancelToggle } from './events-client'
import { EventCompose } from '@/app/(main)/events/event-compose'


function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function AdminEventsPage() {
  const { profileId } = await requireAdmin('host')
  const admin = createAdminClient()

  // Fetch events scoped to circles where user is host
  const { data: hostedCircles } = await admin
    .from('circles')
    .select('id')
    .eq('host_id', profileId)

  // Fetch circles for the New Event modal (membership-based)
  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle:circles!circle_id ( id, name )')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  const myCircles = ((myMemberships ?? []) as unknown as { circle: { id: string; name: string } | null }[])
    .map(m => m.circle).filter((c): c is { id: string; name: string } => !!c)

  type EventRow = {
    id: string; title: string; slug: string; starts_at: string; ends_at: string | null;
    location: string | null; is_cancelled: boolean; host: { display_name: string } | null;
  }

  const circleIds = (hostedCircles ?? []).map((c: { id: string }) => c.id)

  // Also events where user is the host directly
  let events: EventRow[] = []

  if (circleIds.length > 0) {
    const { data } = await admin
      .from('events')
      .select(`id, title, slug, starts_at, ends_at, location, is_cancelled,
               host:profiles!host_id ( display_name )`)
      .in('scope_id', circleIds)
      .order('starts_at', { ascending: false })
    events = (data ?? []) as unknown as EventRow[]
  }

  // Also include events hosted directly by this profile (not scoped to their circles)
  const { data: directHosted } = await admin
    .from('events')
    .select(`id, title, slug, starts_at, ends_at, location, is_cancelled,
             host:profiles!host_id ( display_name )`)
    .eq('host_id', profileId)
    .order('starts_at', { ascending: false })

  // Merge, dedupe
  const seen = new Set(events.map((e) => e.id))
  for (const e of (directHosted ?? []) as unknown as EventRow[]) {
    if (!seen.has(e.id)) events.push(e)
  }
  events.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.starts_at) >= now)
  const past     = events.filter((e) => new Date(e.starts_at) < now)

  return (
    <AdminPage
      title="Events"
      eyebrow="Community"
      description="Manage events across your circles. Cancel or reinstate from here."
      actions={<EventCompose groups={myCircles} />}
      width="default"
    >
      {upcoming.length > 0 && (
        <AdminSection title="Upcoming">
          <div className="space-y-2">
            {upcoming.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </AdminSection>
      )}

      {past.length > 0 && (
        <AdminSection>
          <details>
            <summary className="cursor-pointer select-none text-xs font-medium text-subtle hover:text-muted">
              {past.length} past event{past.length > 1 ? 's' : ''}
            </summary>
            <div className="mt-2 space-y-2 opacity-70">
              {past.slice(0, 20).map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          </details>
        </AdminSection>
      )}

      {events.length === 0 && (
        <AdminSection>
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-subtle/60" />
            <p className="text-sm text-muted">No events yet.</p>
          </div>
        </AdminSection>
      )}
    </AdminPage>
  )
}

function EventRow({ event }: { event: { id: string; title: string; slug: string; starts_at: string; ends_at: string | null; location: string | null; is_cancelled: boolean; host: { display_name: string } | null } }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
      {/* Date chip */}
      <div className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-surface-elevated py-1.5 text-center">
        <span className="text-xs font-semibold uppercase leading-none text-subtle">
          {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="mt-0.5 text-lg font-black leading-none text-text">
          {new Date(event.starts_at).getDate()}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${event.slug}`}
            className="truncate text-sm font-semibold text-text hover:text-primary-strong dark:hover:text-primary-strong"
          >
            {event.title}
          </Link>
          {event.is_cancelled && (
            <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger dark:bg-danger-bg">
              Cancelled
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
          <span>{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</span>
          {event.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {event.location}
            </span>
          )}
        </div>
      </div>

      <CancelToggle id={event.id} isCancelled={event.is_cancelled ?? false} />
    </div>
  )
}
