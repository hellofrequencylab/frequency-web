import { createHash } from 'node:crypto'
import { eventInstant, resolveZone, zoneOffsetMinutes } from '@/lib/time/zone'

// THE TWO-WAY SYNC RULE (LIVE-1179, ADR-1976). Pure: the IO lives in lib/calendar-sync/run.ts.
//
// PUSH. Every published, uncancelled Frequency event in the window gets ONE copy on the connected
// calendar. The copy carries two private markers only Frequency reads: the event id, and a
// FINGERPRINT of what Frequency last wrote (title, place, start, end). Pushed copies are marked
// free (transparent), so they never come back to us as busy time.
//
// THE CONFLICT RULE, in one place:
//   1. Frequency wins for events Frequency created. A change made here is pushed out.
//   2. But never silently. If the copy on the other calendar no longer matches the fingerprint we
//      wrote, someone edited it there. We do NOT overwrite it. It is listed as a conflict, and the
//      team picks: "Use Frequency's version" (overwrite) or "Keep their edit" (we stop syncing
//      that one event, and mark the copy so we never touch it again).
//   3. An event removed or cancelled here deletes its copy, unless the copy was edited there; then
//      it is a conflict too, with the same two answers.
//
// PULL. Every other event on the connected calendar that is not cancelled and not marked free
// becomes an Unavailable block on the Space calendar: times only, titled "Busy", never the private
// title, attendees or notes. The blocks are mirrored, so a block whose source moved or went away
// is removed on the next sync.

export type DatePoint = { date: string } | { dateTime: string; timeZone?: string }

/** A Frequency event, as the push reads it. Times are stored wall clock (lib/time/zone.ts). */
export interface LocalEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  timeZone: string | null
  location: string | null
  url: string
}

/** One event on the connected calendar, reduced to what the rule needs. */
export interface RemoteEvent {
  id: string
  etag: string
  cancelled: boolean
  transparent: boolean
  summary: string | null
  location: string | null
  start: DatePoint
  end: DatePoint
  /** Present only on copies Frequency wrote. */
  frequencyEventId?: string
  fingerprint?: string
  detached?: boolean
}

export interface RemoteBody {
  summary: string
  location?: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  transparency: 'transparent'
  extendedProperties: { private: { frequencyEventId: string; frequencyFingerprint: string } }
}

export type SyncOp =
  | { kind: 'create'; eventId: string; body: RemoteBody }
  | { kind: 'update'; eventId: string; remoteId: string; etag: string; body: RemoteBody }
  | { kind: 'delete'; remoteId: string; etag: string }
  | { kind: 'detach'; eventId: string; remoteId: string; etag: string; fingerprint: string }

export type ConflictKind = 'edited_there' | 'removed_here_edited_there'

export interface SyncConflict {
  eventId: string
  remoteId: string
  title: string
  kind: ConflictKind
}

/** At most this many conflicts are kept for the team to answer; the rest wait for the next sync. */
const MAX_CONFLICTS = 50

const ONE_HOUR_MS = 60 * 60 * 1000

function norm(text: string | null | undefined): string {
  return (text ?? '').trim()
}

/** Milliseconds for a provider date point. An all-day date is its UTC midnight: it only needs to
 *  differ from a timed copy, never to equal one. */
function pointMs(point: DatePoint): number {
  return 'date' in point ? Date.parse(`${point.date}T00:00:00Z`) : Date.parse(point.dateTime)
}

function fingerprint(parts: { title: string | null; location: string | null; startMs: number; endMs: number }): string {
  return createHash('sha256')
    .update(JSON.stringify([norm(parts.title), norm(parts.location), parts.startMs, parts.endMs]))
    .digest('hex')
    .slice(0, 32)
}

function remoteFingerprint(r: RemoteEvent): string {
  return fingerprint({ title: r.summary, location: r.location, startMs: pointMs(r.start), endMs: pointMs(r.end) })
}

/** Stored wall clock (UTC parts) to the bare local time a provider takes beside a time zone. */
function wallDigits(stored: string): string | null {
  const d = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(stored.trim()) ? stored.trim() : `${stored.trim()}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19)
}

/** The provider body for a Frequency event, with its fingerprint. Null when its time cannot be read. */
function remoteBodyFor(event: LocalEvent): RemoteBody | null {
  const zone = resolveZone(event.timeZone)
  const startWall = wallDigits(event.startsAt)
  if (!startWall) return null
  const endStored = event.endsAt && wallDigits(event.endsAt) ? event.endsAt : new Date(Date.parse(`${startWall}Z`) + ONE_HOUR_MS).toISOString()
  const endWall = wallDigits(endStored)
  const start = eventInstant(startWall, zone)
  const end = endWall ? eventInstant(endWall, zone) : null
  if (!endWall || !start || !end || end.getTime() <= start.getTime()) return null
  const title = norm(event.title).slice(0, 300) || 'Event'
  const location = norm(event.location).slice(0, 300)
  return {
    summary: title,
    ...(location ? { location } : {}),
    description: `From Frequency: ${event.url}`,
    start: { dateTime: startWall, timeZone: zone },
    end: { dateTime: endWall, timeZone: zone },
    transparency: 'transparent',
    extendedProperties: {
      private: {
        frequencyEventId: event.id,
        frequencyFingerprint: fingerprint({ title, location, startMs: start.getTime(), endMs: end.getTime() }),
      },
    },
  }
}

/** Decide every write for one sync. `force` and `detach` carry the team's answers to conflicts. */
export function planPush(
  local: LocalEvent[],
  remote: RemoteEvent[],
  answers: { force?: ReadonlySet<string>; detach?: ReadonlySet<string>; window?: { fromMs: number; toMs: number } } = {},
): { ops: SyncOp[]; conflicts: SyncConflict[] } {
  const force = answers.force ?? new Set<string>()
  const detach = answers.detach ?? new Set<string>()
  const ops: SyncOp[] = []
  const conflicts: SyncConflict[] = []

  // The copies Frequency wrote, by event id. A second copy of one event (a write that half failed)
  // is an extra: removed when untouched, otherwise left alone.
  const copies = new Map<string, RemoteEvent>()
  for (const r of remote) {
    if (!r.frequencyEventId || r.cancelled) continue
    // A copy outside the window the local list covers is not judged: its event was simply not read.
    const at = pointMs(r.start)
    if (answers.window && (at < answers.window.fromMs || at >= answers.window.toMs)) continue
    const seen = copies.get(r.frequencyEventId)
    if (!seen) copies.set(r.frequencyEventId, r)
    else if (!r.detached && r.fingerprint === remoteFingerprint(r)) ops.push({ kind: 'delete', remoteId: r.id, etag: r.etag })
  }

  const localIds = new Set<string>()
  for (const event of local) {
    localIds.add(event.id)
    const body = remoteBodyFor(event)
    if (!body) continue
    const copy = copies.get(event.id)
    if (!copy) {
      ops.push({ kind: 'create', eventId: event.id, body })
      continue
    }
    if (copy.detached) continue
    const theirs = remoteFingerprint(copy)
    const ours = body.extendedProperties.private.frequencyFingerprint
    const editedThere = theirs !== copy.fingerprint
    if (editedThere && theirs !== ours) {
      if (force.has(event.id)) ops.push({ kind: 'update', eventId: event.id, remoteId: copy.id, etag: copy.etag, body })
      else if (detach.has(event.id)) ops.push({ kind: 'detach', eventId: event.id, remoteId: copy.id, etag: copy.etag, fingerprint: copy.fingerprint ?? '' })
      else conflicts.push({ eventId: event.id, remoteId: copy.id, title: body.summary, kind: 'edited_there' })
      continue
    }
    // Both sides agree (or only Frequency changed): write ours, which also re-stamps the fingerprint.
    if (ours !== copy.fingerprint) ops.push({ kind: 'update', eventId: event.id, remoteId: copy.id, etag: copy.etag, body })
  }

  for (const [eventId, copy] of copies) {
    if (localIds.has(eventId) || copy.detached) continue
    const editedThere = remoteFingerprint(copy) !== copy.fingerprint
    if (!editedThere || force.has(eventId)) ops.push({ kind: 'delete', remoteId: copy.id, etag: copy.etag })
    else if (detach.has(eventId)) ops.push({ kind: 'detach', eventId, remoteId: copy.id, etag: copy.etag, fingerprint: copy.fingerprint ?? '' })
    else conflicts.push({ eventId, remoteId: copy.id, title: norm(copy.summary) || 'Event', kind: 'removed_here_edited_there' })
  }

  return { ops, conflicts: conflicts.slice(0, MAX_CONFLICTS) }
}

/** A busy block as the Space calendar stores it: wall clock as UTC parts in the Space's zone. */
export interface BusyBlock {
  externalId: string
  startsAt: string
  endsAt: string
  allDay: boolean
}

/** A busy block already mirrored onto the Space calendar. */
export interface MirroredBlock {
  id: string
  externalId: string
  startsAt: string
  endsAt: string
}

function wallInZone(ms: number, zone: string): string {
  return new Date(ms + zoneOffsetMinutes(new Date(ms), zone) * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** The busy blocks a set of remote events makes, in the Space's zone. Frequency's own copies,
 *  cancelled events and events marked free are not busy. */
export function busyBlocks(remote: RemoteEvent[], spaceZone: string | null | undefined): BusyBlock[] {
  const zone = resolveZone(spaceZone)
  const out: BusyBlock[] = []
  for (const r of remote) {
    if (r.frequencyEventId || r.cancelled || r.transparent) continue
    const startMs = pointMs(r.start)
    const endMs = pointMs(r.end)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
    const allDay = 'date' in r.start
    out.push({
      externalId: r.id,
      allDay,
      // An all-day date is already a wall date; a timed one is an instant, moved into the Space's zone.
      startsAt: allDay ? new Date(startMs).toISOString().replace(/\.\d{3}Z$/, 'Z') : wallInZone(startMs, zone),
      endsAt: allDay ? new Date(endMs).toISOString().replace(/\.\d{3}Z$/, 'Z') : wallInZone(endMs, zone),
    })
  }
  return out
}

/** What to add and what to remove so the mirrored blocks match the remote busy blocks. */
export function diffBusy(wanted: BusyBlock[], mirrored: MirroredBlock[]): { insert: BusyBlock[]; remove: string[] } {
  const key = (b: { externalId: string; startsAt: string; endsAt: string }) => `${b.externalId}|${Date.parse(b.startsAt)}|${Date.parse(b.endsAt)}`
  const have = new Map(mirrored.map((m) => [key(m), m.id]))
  const want = new Set(wanted.map(key))
  return {
    insert: wanted.filter((b) => !have.has(key(b))),
    remove: mirrored.filter((m) => !want.has(key(m))).map((m) => m.id),
  }
}
