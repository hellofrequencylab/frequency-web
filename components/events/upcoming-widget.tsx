import Link from 'next/link'
import { CalendarDays, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

type WidgetEvent = {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
  scope_id: string
}

function formatShort(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return (
    <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 shrink-0">
      <span className="text-[9px] font-semibold uppercase leading-none">{month}</span>
      <span className="text-sm font-bold leading-tight">{day}</span>
    </div>
  )
}

export async function UpcomingEventsWidget({
  scopeIds,
}: {
  scopeIds: string[]
}) {
  if (scopeIds.length === 0) return null

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: raw } = await admin
    .from('events')
    .select('id, title, slug, location, starts_at, scope_id')
    .in('scope_id', scopeIds)
    .in('scope_type', ['circle', 'group'])  // accept both during transition
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(3)

  const events = (raw ?? []) as WidgetEvent[]

  if (events.length === 0) return null

  return (
    <section className="mt-8 border-t border-gray-100 pt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Upcoming Events</h2>
        <Link
          href="/events"
          className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
        >
          See all →
        </Link>
      </div>

      <div className="space-y-2">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
          >
            <DateChip iso={event.starts_at} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-xs text-gray-400">
                  {formatShort(event.starts_at)} · {formatTime(event.starts_at)}
                </span>
                {event.location && (
                  <span className="flex items-center gap-0.5 text-xs text-gray-400">
                    <MapPin className="w-3 h-3" />
                    {event.location}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
