'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { envFlag } from '@/lib/env/string'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { calendarAuthorizationUrl, calendarProvider, calendarSyncReady } from '@/lib/calendar-sync/oauth'
import { beginSyncConnection, deleteSyncConnection, readSyncConnection } from '@/lib/calendar-sync/store'
import { runCalendarSync } from '@/lib/calendar-sync/run'
import type { ConflictKind } from '@/lib/calendar-sync/plan'

// TWO-WAY CALENDAR SYNC, server half (LIVE-1179, ADR-1976). Behind CALENDAR_SYNC_ENABLED.
//
// GATE. Connecting a calendar hands Frequency write access to someone's real calendar, so it is the
// Space's OWNER and ADMINS only (caps.isAdmin), not editors, and only while the Space has Events on.
// Every export re-proves that from the session before doing anything; the table's RLS
// (private.is_space_admin) is the same rule a second time. Tokens never leave the server: these
// actions return states, names and conflicts, nothing sealed.

export interface CalendarSyncConflictView {
  eventId: string
  title: string
  kind: ConflictKind
}

export interface CalendarSyncStatus {
  /** CALENDAR_SYNC_ENABLED is on. */
  switchedOn: boolean
  /** The switch is on and the Google client and seal key are set. */
  ready: boolean
  /** The viewer may connect, sync and disconnect. */
  canManage: boolean
  state: 'none' | 'pending' | 'connected'
  calendarLabel: string | null
  lastSyncedAt: string | null
  lastError: string | null
  conflicts: CalendarSyncConflictView[]
}

const OFF: CalendarSyncStatus = {
  switchedOn: false, ready: false, canManage: false, state: 'none', calendarLabel: null, lastSyncedAt: null, lastError: null, conflicts: [],
}

async function resolveAdmin(slug: string): Promise<{ space: { id: string; timeZone: string | null }; actorId: string } | null> {
  if (typeof slug !== 'string' || !slug) return null
  const caller = await getCallerProfile()
  if (!caller?.id) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.isAdmin || !spaceFunctionAccess(space, 'events', caps.role)) return null
  return { space: { id: space.id, timeZone: space.timeZone ?? null }, actorId: caller.id }
}

/** Read the Google row for the settings sheet. Costs nothing while the switch is off. */
export async function readCalendarSyncStatus(slug: string): Promise<CalendarSyncStatus> {
  if (!envFlag('CALENDAR_SYNC_ENABLED')) return OFF
  const ready = calendarSyncReady('google')
  const admin = await resolveAdmin(slug)
  if (!admin) return { ...OFF, switchedOn: true, ready }
  const connection = await readSyncConnection(admin.space.id, 'google')
  return {
    switchedOn: true,
    ready,
    canManage: true,
    state: connection?.state ?? 'none',
    calendarLabel: connection?.calendarLabel ?? null,
    lastSyncedAt: connection?.lastSyncedAt ?? null,
    lastError: connection?.lastError ?? null,
    conflicts: (connection?.conflicts ?? []).map((c) => ({ eventId: c.eventId, title: c.title, kind: c.kind })),
  }
}

/** Start the Google consent screen. The browser follows the returned address. */
export async function connectCalendar(slug: string, providerName: string): Promise<ActionResult<{ url: string }>> {
  const provider = calendarProvider(providerName)
  if (!provider || !calendarSyncReady(provider)) return fail('Calendar sync is not switched on yet.')
  const admin = await resolveAdmin(slug)
  if (!admin) return fail('Only the owner or an admin of this Space can connect a calendar.')
  const started = await beginSyncConnection(admin.space.id, provider, admin.actorId)
  const url = started ? calendarAuthorizationUrl(provider, started.state, started.challenge) : null
  return url ? ok({ url }) : fail('The connection could not be started. Try again in a moment.')
}

/** Sync now, optionally with the team's answer to one conflict. */
export async function syncCalendarNow(
  slug: string,
  providerName: string,
  answer?: { eventId: string; keep: 'ours' | 'theirs' },
): Promise<ActionResult<{ pushed: number; busy: number; conflicts: number }>> {
  const provider = calendarProvider(providerName)
  if (!provider || !calendarSyncReady(provider)) return fail('Calendar sync is not switched on yet.')
  const admin = await resolveAdmin(slug)
  if (!admin) return fail('Only the owner or an admin of this Space can sync the calendar.')
  const eventId = answer && typeof answer.eventId === 'string' && /^[0-9a-f-]{36}$/i.test(answer.eventId) ? answer.eventId : null
  const result = await runCalendarSync(admin.space, provider, admin.actorId, {
    force: eventId && answer?.keep === 'ours' ? [eventId] : [],
    detach: eventId && answer?.keep === 'theirs' ? [eventId] : [],
  })
  if (!result.ok) {
    return fail(result.error === 'reconnect' ? 'Google stopped accepting this connection. Connect it again.' : 'The sync did not finish. Try again in a moment.')
  }
  return ok({ pushed: result.pushed, busy: result.busy, conflicts: result.conflicts.length })
}

export async function disconnectCalendar(slug: string, providerName: string): Promise<ActionResult> {
  const provider = calendarProvider(providerName)
  if (!provider) return fail('That calendar is not one we sync with.')
  const admin = await resolveAdmin(slug)
  if (!admin) return fail('Only the owner or an admin of this Space can disconnect a calendar.')
  return (await deleteSyncConnection(admin.space.id, provider)) ? ok() : fail('It could not be disconnected. Try again in a moment.')
}
