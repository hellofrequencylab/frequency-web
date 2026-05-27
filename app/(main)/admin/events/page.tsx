import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, CalendarDays, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CancelToggle } from './events-client'

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

  if (!profile || !['host', 'guide', 'mentor'].includes(profile.community_role)) notFound()

  // Fetch events scoped to circles where user is host
  const { data: hostedCircles } = await admin
    .from('circles')
    .select('id')
    .eq('host_id', profile.id)

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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Events</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage events across your circles. Cancel or reinstate from here.
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New event
        </Link>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-3">Upcoming</h2>
          <div className="space-y-2">
            {upcoming.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-3">Past</h2>
          <div className="space-y-2 opacity-70">
            {past.slice(0, 20).map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {events.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center">
          <CalendarDays className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No events yet.</p>
        </div>
      )}
    </div>
  )
}

function EventRow({ event }: { event: { id: string; title: string; slug: string; starts_at: string; ends_at: string | null; location: string | null; is_cancelled: boolean; host: { display_name: string } | null } }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
      {/* Date chip */}
      <div className="shrink-0 w-10 flex flex-col items-center rounded-lg bg-gray-50 dark:bg-gray-800 py-1.5 text-center">
        <span className="text-[10px] font-semibold text-gray-400 uppercase leading-none">
          {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-lg font-black text-gray-900 dark:text-gray-50 leading-none mt-0.5">
          {new Date(event.starts_at).getDate()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/events/${event.slug}`}
            className="text-sm font-semibold text-gray-900 dark:text-gray-50 hover:text-indigo-600 dark:hover:text-indigo-400 truncate"
          >
            {event.title}
          </Link>
          {event.is_cancelled && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-medium">
              Cancelled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
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
