import 'server-only'
import { listEventsForSpace } from '@/lib/events/store'
import { adminEventCeilingDay } from '@/lib/calendar/month-window'
import { dayInZone, eventInstant, resolveZone } from '@/lib/time/zone'
import { SITE_URL } from '@/lib/site'
import { log } from '@/lib/log'
import { applyGoogleCalendarOp, listGoogleCalendarWindow } from './google'
import { freshCalendarTokens, type CalendarProvider } from './oauth'
import { busyBlocks, diffBusy, planPush, type LocalEvent, type SyncConflict } from './plan'
import {
  insertMirroredBlocks,
  listMirroredBlocks,
  openSyncTokens,
  readSyncConnection,
  recordSyncResult,
  removeMirroredBlocks,
} from './store'

// ONE SYNC, ON DEMAND (LIVE-1179, ADR-1976). Run from the calendar settings ("Sync now", and after a
// conflict is answered) by a Space owner or admin, on their own session. No worker, no queue and no
// new infrastructure: the read, the plan (lib/calendar-sync/plan.ts) and the writes happen inside the
// one request. A run is bounded (MAX_WRITES), and whatever it did not reach waits for the next one.
//
// The CALLER proves the actor may manage this Space before calling. This file trusts that gate the way
// the calendar's other server halves do; RLS on both tables is the second lock.

const EVENT_LIMIT = 200
const MAX_WRITES = 60

export interface SyncOutcome {
  ok: boolean
  pushed: number
  busy: number
  conflicts: SyncConflict[]
  error?: string
}

function localEvents(rows: Awaited<ReturnType<typeof listEventsForSpace>>): LocalEvent[] {
  return rows
    .filter((r) => !r.is_cancelled && r.starts_at)
    .map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      timeZone: r.time_zone,
      // A hidden address stays hidden on the other calendar too: the venue name only.
      location: r.hide_address ? (r.venue_name ?? null) : (r.location ?? r.venue_name ?? null),
      url: `${SITE_URL}/events/${r.slug}`,
    }))
}

export async function runCalendarSync(
  space: { id: string; timeZone: string | null },
  provider: CalendarProvider,
  actorId: string,
  answers: { force?: string[]; detach?: string[] } = {},
): Promise<SyncOutcome> {
  const connection = await readSyncConnection(space.id, provider)
  if (!connection || connection.state !== 'connected') return { ok: false, pushed: 0, busy: 0, conflicts: [], error: 'not_connected' }
  const stored = await openSyncTokens(connection)
  const tokens = stored ? await freshCalendarTokens(stored) : null
  if (!tokens) {
    await recordSyncResult(connection, { conflicts: connection.conflicts, label: null, error: 'Google stopped accepting this connection. Connect it again.' })
    return { ok: false, pushed: 0, busy: 0, conflicts: connection.conflicts, error: 'reconnect' }
  }
  const refreshed = tokens !== stored ? tokens : undefined

  try {
    const now = new Date()
    const zone = resolveZone(space.timeZone)
    // THE WINDOW: from the start of the Space's today to the team calendar's own ceiling, the same
    // range the events reader uses, so the two sides are judged over exactly one stretch of time.
    const today = dayInZone(now, zone)
    const ceiling = adminEventCeilingDay(now)
    const fromMs = eventInstant(`${today}T00:00:00`, zone)?.getTime() ?? now.getTime()
    let toMs = eventInstant(`${ceiling}T00:00:00`, zone)?.getTime() ?? now.getTime()
    const rows = await listEventsForSpace(space.id, { limit: EVENT_LIMIT, fromDay: today, toDay: ceiling })
    // A full page means more events may exist past the last one read, so the window stops there and
    // no copy of an unread event is mistaken for a deleted one.
    if (rows.length === EVENT_LIMIT) {
      const last = eventInstant(rows[rows.length - 1].starts_at, rows[rows.length - 1].time_zone)
      if (last) toMs = last.getTime()
    }
    const local = localEvents(rows).filter((e) => {
      const at = eventInstant(e.startsAt, e.timeZone)?.getTime()
      return at !== undefined && at >= fromMs && at < toMs
    })

    const remote = await listGoogleCalendarWindow({
      accessToken: tokens.accessToken,
      calendarId: connection.calendarId,
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
    })
    const plan = planPush(local, remote.events, {
      force: new Set(answers.force ?? []),
      detach: new Set(answers.detach ?? []),
      window: { fromMs, toMs },
    })
    let pushed = 0
    for (const op of plan.ops.slice(0, MAX_WRITES)) {
      const result = await applyGoogleCalendarOp({ accessToken: tokens.accessToken, calendarId: connection.calendarId, op })
      if (result.kind === 'done') pushed++
    }

    // PULL: busy time from today on, mirrored as Unavailable blocks.
    const fromWall = `${today}T00:00:00Z`
    const wanted = busyBlocks(remote.events, zone).filter((b) => Date.parse(b.startsAt) >= Date.parse(fromWall))
    const mirrored = await listMirroredBlocks(space.id, provider, fromWall)
    const stale = mirrored.filter((m) => m.connectionId !== connection.id)
    const diff = diffBusy(wanted, mirrored.filter((m) => m.connectionId === connection.id))
    await removeMirroredBlocks(space.id, [...diff.remove, ...stale.map((m) => m.id)])
    await insertMirroredBlocks(connection, diff.insert, zone, actorId)

    await recordSyncResult(connection, { conflicts: plan.conflicts, label: remote.label, error: null, tokens: refreshed })
    return { ok: true, pushed, busy: wanted.length, conflicts: plan.conflicts }
  } catch (err) {
    log.warn('calendar_sync.run_failed', { provider, error: err instanceof Error ? err.message : String(err) })
    await recordSyncResult(connection, { conflicts: connection.conflicts, label: null, error: 'The last sync did not finish. Try again in a moment.', tokens: refreshed })
    return { ok: false, pushed: 0, busy: 0, conflicts: connection.conflicts, error: 'failed' }
  }
}
