// Token-keyed private Space team calendar (ADR-1386 P7). Never slug-keyed.
// The token in the path is the credential. Calendar apps poll with no session.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVevent, icsEventInstants, renderCalendar } from '@/lib/events/ics'
import { dueTaskToCalendarItem } from '@/lib/calendar/due-dates'
import { listTasks } from '@/lib/crm/tasks'

export const dynamic = 'force-dynamic'

type EntryRow = {
  id: string
  title: string
  notes: string | null
  location: string | null
  starts_at: string
  ends_at: string
  time_zone: string | null
  status: string
  plan_id: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const admin = createAdminClient()
  const { data: feed, error } = await admin
    .from('space_calendar_private_feeds')
    .select('space_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  const row = feed as { space_id: string; revoked_at: string | null } | null
  if (error || !row || row.revoked_at) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: entries } = await admin
    .from('space_calendar_entries')
    .select('id, title, notes, location, starts_at, ends_at, time_zone, status, plan_id')
    .eq('space_id', row.space_id)
    .neq('status', 'cancelled')
    .limit(400)

  const todos = await listTasks({ spaceId: row.space_id, limit: 200 })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const vevents = [
    ...((entries as EntryRow[] | null) ?? []).map((ev) => {
      const { start, end } = icsEventInstants(ev.starts_at, ev.ends_at, ev.time_zone)
      return buildVevent({
        uid: ev.id,
        start,
        end,
        summary: ev.title,
        url: `${appUrl}/spaces`,
        location: ev.location,
        description: ev.notes,
        cancelled: ev.status === 'cancelled',
      })
    }),
    ...todos
      .map((t) => (t.dueAt ? dueTaskToCalendarItem({ id: t.id, title: t.title, dueAt: t.dueAt, planId: t.planId }) : null))
      .filter((item): item is NonNullable<typeof item> => !!item)
      .map((item) => {
        const start = item.startInstantIso ? new Date(item.startInstantIso) : new Date(`${item.dayKey}T12:00:00.000Z`)
        return buildVevent({
          uid: item.slug,
          start,
          end: start,
          summary: item.title,
          url: `${appUrl}/spaces`,
          location: null,
          description: item.notes,
          cancelled: false,
        })
      }),
  ]

  const body = renderCalendar({
    name: 'Space team calendar',
    description: 'Private team dates. This feed is token-keyed and revocable.',
    vevents,
  })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
