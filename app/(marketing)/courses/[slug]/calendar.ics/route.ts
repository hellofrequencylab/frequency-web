// /courses/<slug>/calendar.ics: every session of a course's next Run in one calendar file (owner 2026-11-18:
// "a calendar invite"). Public by design: the sessions are public events whose pages already show all of
// this. Each session is its own VEVENT with the event's own UID, so a calendar that already holds one of
// them from the per-event export updates it instead of adding a duplicate.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicJourney } from '@/lib/journey-plans'
import { isFrequencyCourse } from '@/lib/courses/library'
import { buildVevent, icsEventInstants, renderCalendar } from '@/lib/events/ics'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = await getPublicJourney(slug)
  if (!found || !(await isFrequencyCourse(found.plan))) return new NextResponse('Course not found', { status: 404 })
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await createAdminClient()
    .from('events')
    .select('id, slug, title, description, starts_at, ends_at, time_zone')
    .eq('journey_id', found.plan.id)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('is_cancelled', false)
    .gte('starts_at', today)
    .order('starts_at', { ascending: true })
    .limit(24)
  const rows = (data as { id: string; slug: string; title: string; description: string | null; starts_at: string; ends_at: string | null; time_zone: string | null }[] | null) ?? []
  const base = SITE_URL.replace(/\/$/, '')
  const body = renderCalendar({
    name: found.plan.title,
    vevents: rows.map((r) => {
      const { start, end } = icsEventInstants(r.starts_at, r.ends_at, r.time_zone)
      return buildVevent({
        uid: r.id,
        start,
        end,
        summary: r.title,
        url: `${base}/events/${r.slug}`,
        location: 'Online · Zoom',
        description: `${r.description ?? ''}\n\nThe Zoom link is on the event page once your seat is saved: ${base}/events/${r.slug}`.trim(),
      })
    }),
  })
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
