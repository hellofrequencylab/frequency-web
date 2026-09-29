// Token-keyed private Space team calendar (ADR-1386 P7). Never slug-keyed.
// The token in the path is the credential. Calendar apps poll with no session.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVevent, renderCalendar } from '@/lib/events/ics'
import { entryFeedFields, withSharedPlanRows, type FeedEntryRow } from '@/lib/calendar/entry-feed'
import { dueTaskToCalendarItem } from '@/lib/calendar/due-dates'
import { listTasks, listTasksInPlans, type CrmTask } from '@/lib/crm/tasks'

export const dynamic = 'force-dynamic'

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

  // 🔴 `removed_at is null` IS NOT OPTIONAL HERE (LIVE-536). This read is SERVICE ROLE, so no policy
  // filters it, and the subscriber is a calendar app that caches what it is handed. Deleting an entry
  // is a tombstone now rather than a `.delete()`, so without this filter a deleted date — including a
  // whole repeating series, which is ONE row with its own RRULE — would keep drawing itself in the
  // team's phone calendars indefinitely, which is the deleted-but-still-visible failure the tombstone
  // exists to avoid.
  const ENTRY_COLS = 'id, title, notes, location, starts_at, ends_at, time_zone, status, plan_id, recurrence_rule, exception_dates'
  const { data: entries } = await admin
    .from('space_calendar_entries')
    .select(ENTRY_COLS)
    .eq('space_id', row.space_id)
    .neq('status', 'cancelled')
    .is('removed_at', null)
    .limit(400)

  const ownTodos = await listTasks({ spaceId: row.space_id, limit: 200 })

  // SHARED PLANS, SHARED PLANS ONLY (PROG-CAL7 Together, LIVE-546). A co-host team subscribing to
  // its own feed sees the dates and to-dos of the Plans shared with it, keyed by the ACCEPTED
  // shares whose guest is this feed's Space: a pending offer the guest has not answered adds
  // nothing, a declined or revoked share adds nothing, and the host's other dates are never read.
  // Each summary is prefixed with the host Space's name so a subscriber can tell whose date it is.
  const { data: shares } = await admin
    .from('space_plan_shares')
    .select('plan_id')
    .eq('guest_space_id', row.space_id)
    .eq('status', 'accepted')
    .limit(200)
  const sharedPlanIds = [...new Set(((shares as { plan_id: string }[] | null) ?? []).map((s) => s.plan_id))]
  let sharedEntries: FeedEntryRow[] = []
  let sharedTodos: CrmTask[] = []
  const hostNameByPlan = new Map<string, string>()
  if (sharedPlanIds.length > 0) {
    const { data: plans } = await admin.from('space_plans').select('id, space_id').in('id', sharedPlanIds).is('archived_at', null)
    const planRows = (plans as { id: string; space_id: string }[] | null) ?? []
    const hostIds = [...new Set(planRows.map((p) => p.space_id))]
    const { data: hosts } = hostIds.length ? await admin.from('spaces').select('id, name').in('id', hostIds) : { data: [] }
    const hostName = new Map(((hosts as { id: string; name: string }[] | null) ?? []).map((h) => [h.id, h.name]))
    for (const p of planRows) {
      const name = hostName.get(p.space_id)
      if (name) hostNameByPlan.set(p.id, name)
    }
    const livePlanIds = [...hostNameByPlan.keys()]
    if (livePlanIds.length > 0) {
      const { data: hostEntries } = await admin
        .from('space_calendar_entries')
        .select(ENTRY_COLS)
        .in('plan_id', livePlanIds)
        .neq('status', 'cancelled')
        .is('removed_at', null)
        .limit(400)
      sharedEntries = (hostEntries as FeedEntryRow[] | null) ?? []
      sharedTodos = await listTasksInPlans(livePlanIds, 200)
    }
  }
  const hostOf = (planId: string | null | undefined) => (planId ? hostNameByPlan.get(planId) : null)
  const feedEntries = withSharedPlanRows(((entries as FeedEntryRow[] | null) ?? []), sharedEntries, (r) => hostOf(r.plan_id))
  const todos = withSharedPlanRows(ownTodos, sharedTodos, (t) => hostOf(t.planId))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  // A REPEATING PENCIL IS ONE VEVENT (PROG-CAL13): the anchor plus its RRULE and one EXDATE per
  // skipped day, in the entry's zone, so the subscriber's calendar draws the series and keeps the gap.
  // Every zone a series is stamped in needs a VTIMEZONE block; renderCalendar dedupes them.
  const tzids: string[] = []
  const vevents = [
    ...feedEntries.map((ev) => {
      const fields = entryFeedFields(ev, `${appUrl}/spaces`)
      if (fields.rrule && fields.tzid) tzids.push(fields.tzid)
      return buildVevent(fields)
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
    tzids,
  })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
