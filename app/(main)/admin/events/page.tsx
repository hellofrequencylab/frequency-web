import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, CalendarDays, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CancelToggle } from './events-client'
import { EventCompose } from '@/app/(main)/events/event-compose'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function AdminEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)) notFound()

  // Fetch events scoped to circles where user is host
  const { data: hostedCircles } = await admin
    .from('circles')
    .select('id')
    .eq('host_id', profile.id)

  // Fetch circles for the New Event modal (membership-based)
  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle:circles!circle_id ( id, name )')
    .eq('profile_id', profile.id)
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
    .eq('host_id', profile.id)
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
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Events</h1>
          <p className="text-sm text-muted mt-1">
            Manage events across your circles. Cancel or reinstate from here.
          </p>
        </div>
        <EventCompose groups={myCircles} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="space-y-2 mb-6">
              {upcoming.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <details>
              <summary className="text-xs font-medium text-subtle cursor-pointer hover:text-muted select-none">
                {past.length} past event{past.length > 1 ? 's' : ''}
              </summary>
              <div className="space-y-2 mt-2 opacity-70">
                {past.slice(0, 20).map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            </details>
          )}

          {events.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <CalendarDays className="w-8 h-8 text-subtle/60 mx-auto mb-3" />
              <p className="text-sm text-muted">No events yet.</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="Quick Actions">
            <div className="p-2 space-y-0.5">
              <Link href="/events/new" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-elevated transition-colors">
                <Plus className="w-4 h-4 text-subtle" /> New Event
              </Link>
            </div>
            <p className="px-4 py-3 text-xs text-subtle">Cancelling an event notifies RSVPed members and marks it on the events page.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}

function EventRow({ event }: { event: { id: string; title: string; slug: string; starts_at: string; ends_at: string | null; location: string | null; is_cancelled: boolean; host: { display_name: string } | null } }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      {/* Date chip */}
      <div className="shrink-0 w-10 flex flex-col items-center rounded-lg bg-surface-elevated py-1.5 text-center">
        <span className="text-[10px] font-semibold text-subtle uppercase leading-none">
          {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-lg font-black text-text leading-none mt-0.5">
          {new Date(event.starts_at).getDate()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/events/${event.slug}`}
            className="text-sm font-semibold text-text hover:text-primary-strong dark:hover:text-primary-strong truncate"
          >
            {event.title}
          </Link>
          {event.is_cancelled && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-danger-bg dark:bg-danger-bg text-danger font-medium">
              Cancelled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-subtle">
          <span>{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</span>
          {event.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {event.location}
            </span>
          )}
        </div>
      </div>

      <CancelToggle id={event.id} isCancelled={event.is_cancelled ?? false} />
    </div>
  )
}
