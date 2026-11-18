import { describe, expect, it } from 'vitest'
import { busyBlocks, diffBusy, planPush, type LocalEvent, type RemoteEvent, type RemoteBody } from './plan'

// THE CONFLICT RULE (LIVE-1179, ADR-1976): Frequency wins for events Frequency created, but an edit
// made on the other calendar is never silently overwritten.

const event: LocalEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Full Moon Circle',
  startsAt: '2026-12-04T19:00:00+00:00',
  endsAt: '2026-12-04T21:00:00+00:00',
  timeZone: 'America/Los_Angeles',
  location: 'The Studio',
  url: 'https://frequencylocal.com/events/full-moon',
}

/** What a provider hands back for the copy we wrote: same instant, offset form. */
function copyOf(body: RemoteBody, patch: Partial<RemoteEvent> = {}): RemoteEvent {
  return {
    id: 'remote-1',
    etag: '"e1"',
    cancelled: false,
    transparent: true,
    summary: body.summary,
    location: body.location ?? null,
    start: { dateTime: `${body.start.dateTime}-08:00`, timeZone: body.start.timeZone },
    end: { dateTime: `${body.end.dateTime}-08:00`, timeZone: body.end.timeZone },
    frequencyEventId: body.extendedProperties.private.frequencyEventId,
    fingerprint: body.extendedProperties.private.frequencyFingerprint,
    ...patch,
  }
}

function firstBody(): RemoteBody {
  const { ops } = planPush([event], [])
  const op = ops[0]
  if (op.kind !== 'create') throw new Error('expected a create')
  return op.body
}

describe('planPush', () => {
  it('creates one free copy, in the event zone, carrying the private markers', () => {
    const body = firstBody()
    expect(body.start).toEqual({ dateTime: '2026-12-04T19:00:00', timeZone: 'America/Los_Angeles' })
    expect(body.end.dateTime).toBe('2026-12-04T21:00:00')
    expect(body.transparency).toBe('transparent')
    expect(body.extendedProperties.private.frequencyEventId).toBe(event.id)
    expect(body.extendedProperties.private.frequencyFingerprint).toMatch(/^[0-9a-f]{32}$/)
  })

  it('does nothing when the copy matches what Frequency last wrote', () => {
    const body = firstBody()
    expect(planPush([event], [copyOf(body)])).toEqual({ ops: [], conflicts: [] })
  })

  it('pushes a change made in Frequency (Frequency wins for its own events)', () => {
    const body = firstBody()
    const moved = { ...event, startsAt: '2026-12-04T18:00:00+00:00' }
    const { ops, conflicts } = planPush([moved], [copyOf(body)])
    expect(conflicts).toEqual([])
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'update', remoteId: 'remote-1', etag: '"e1"' })
  })

  it('never silently overwrites an edit made on the other calendar', () => {
    const body = firstBody()
    const edited = copyOf(body, { summary: 'Full Moon Circle (moved room)' })
    const { ops, conflicts } = planPush([event], [edited])
    expect(ops).toEqual([])
    expect(conflicts).toEqual([{ eventId: event.id, remoteId: 'remote-1', title: 'Full Moon Circle', kind: 'edited_there' }])
  })

  it('still flags the edit when Frequency changed too', () => {
    const body = firstBody()
    const moved = { ...event, title: 'Full Moon Circle, indoors' }
    const { ops, conflicts } = planPush([moved], [copyOf(body, { location: 'Garden' })])
    expect(ops).toEqual([])
    expect(conflicts[0].kind).toBe('edited_there')
  })

  it('overwrites only when the team answers "Use Frequency\'s version"', () => {
    const body = firstBody()
    const edited = copyOf(body, { summary: 'Renamed there' })
    const { ops, conflicts } = planPush([event], [edited], { force: new Set([event.id]) })
    expect(conflicts).toEqual([])
    expect(ops[0]).toMatchObject({ kind: 'update', remoteId: 'remote-1' })
  })

  it('detaches the copy, keeping its markers, when the team keeps their edit', () => {
    const body = firstBody()
    const edited = copyOf(body, { summary: 'Renamed there' })
    const { ops } = planPush([event], [edited], { detach: new Set([event.id]) })
    expect(ops).toEqual([
      { kind: 'detach', eventId: event.id, remoteId: 'remote-1', etag: '"e1"', fingerprint: body.extendedProperties.private.frequencyFingerprint },
    ])
    // Once detached, the event is never written again and no second copy is made.
    expect(planPush([{ ...event, title: 'New name' }], [{ ...edited, detached: true }])).toEqual({ ops: [], conflicts: [] })
  })

  it('re-stamps without a conflict when both sides made the same change', () => {
    const body = firstBody()
    const moved = { ...event, title: 'Same new title' }
    const { ops, conflicts } = planPush([moved], [copyOf(body, { summary: 'Same new title' })])
    expect(conflicts).toEqual([])
    expect(ops[0].kind).toBe('update')
  })

  it('deletes the copy of an event removed here, unless it was edited there', () => {
    const body = firstBody()
    expect(planPush([], [copyOf(body)]).ops).toEqual([{ kind: 'delete', remoteId: 'remote-1', etag: '"e1"' }])
    const edited = planPush([], [copyOf(body, { location: 'Elsewhere' })])
    expect(edited.ops).toEqual([])
    expect(edited.conflicts[0].kind).toBe('removed_here_edited_there')
  })

  it('leaves copies outside the read window alone', () => {
    const body = firstBody()
    const at = Date.parse('2026-12-05T03:00:00Z')
    expect(planPush([], [copyOf(body)], { window: { fromMs: at + 1, toMs: at + 10_000 } }).ops).toEqual([])
  })

  it('removes an untouched duplicate copy', () => {
    const body = firstBody()
    const { ops } = planPush([event], [copyOf(body), copyOf(body, { id: 'remote-2', etag: '"e2"' })])
    expect(ops).toEqual([{ kind: 'delete', remoteId: 'remote-2', etag: '"e2"' }])
  })
})

describe('busy time comes back as times only', () => {
  const remote: RemoteEvent[] = [
    { id: 'a', etag: '"1"', cancelled: false, transparent: false, summary: 'Private dentist', location: 'Somewhere', start: { dateTime: '2026-12-01T17:00:00Z' }, end: { dateTime: '2026-12-01T18:00:00Z' } },
    { id: 'b', etag: '"1"', cancelled: false, transparent: false, summary: 'Trip', location: null, start: { date: '2026-12-10' }, end: { date: '2026-12-12' } },
    { id: 'free', etag: '"1"', cancelled: false, transparent: true, summary: null, location: null, start: { dateTime: '2026-12-01T17:00:00Z' }, end: { dateTime: '2026-12-01T18:00:00Z' } },
    { id: 'gone', etag: '"1"', cancelled: true, transparent: false, summary: null, location: null, start: { dateTime: '2026-12-01T17:00:00Z' }, end: { dateTime: '2026-12-01T18:00:00Z' } },
    { id: 'ours', etag: '"1"', cancelled: false, transparent: false, summary: null, location: null, start: { dateTime: '2026-12-01T17:00:00Z' }, end: { dateTime: '2026-12-01T18:00:00Z' }, frequencyEventId: 'x' },
  ]

  it('mirrors busy events in the Space zone, without titles, and skips free, cancelled and our own copies', () => {
    expect(busyBlocks(remote, 'America/Los_Angeles')).toEqual([
      { externalId: 'a', allDay: false, startsAt: '2026-12-01T09:00:00Z', endsAt: '2026-12-01T10:00:00Z' },
      { externalId: 'b', allDay: true, startsAt: '2026-12-10T00:00:00Z', endsAt: '2026-12-12T00:00:00Z' },
    ])
  })

  it('adds only new blocks and removes only blocks that went away', () => {
    const wanted = busyBlocks(remote, 'America/Los_Angeles')
    const mirrored = [
      { id: 'keep', externalId: 'a', startsAt: '2026-12-01T09:00:00+00:00', endsAt: '2026-12-01T10:00:00+00:00' },
      { id: 'drop', externalId: 'old', startsAt: '2026-11-30T09:00:00+00:00', endsAt: '2026-11-30T10:00:00+00:00' },
    ]
    expect(diffBusy(wanted, mirrored)).toEqual({ insert: [wanted[1]], remove: ['drop'] })
  })
})
