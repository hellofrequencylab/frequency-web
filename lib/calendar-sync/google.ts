import type { DatePoint, RemoteEvent, SyncOp } from './plan'

type GoogleChange =
  | { id: string; kind: 'cancelled' }
  | { id: string; kind: 'event'; etag: string; start: DatePoint; end: DatePoint }

type Fetch = typeof fetch

const MAX_PAGES = 50
const base = 'https://www.googleapis.com/calendar/v3/calendars/'

function eventUrl(calendarId: string, eventId?: string): URL {
  if (!calendarId || [calendarId, eventId].some((id) => id === '.' || id === '..')) throw new Error('Invalid Google Calendar identifier.')
  const id = encodeURIComponent(calendarId)
  return new URL(base + id + '/events' + (eventId ? '/' + encodeURIComponent(eventId) : ''))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function point(value: unknown): DatePoint {
  if (isRecord(value)) {
    if (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) return { date: value.date }
    if (typeof value.dateTime === 'string' && Number.isFinite(Date.parse(value.dateTime))) {
      return { dateTime: value.dateTime, ...(typeof value.timeZone === 'string' ? { timeZone: value.timeZone } : {}) }
    }
  }
  throw new Error('Google Calendar returned an invalid event boundary.')
}

function change(value: unknown): GoogleChange {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) throw new Error('Google Calendar returned an event without an ID.')
  if (value.status === 'cancelled') return { id: value.id, kind: 'cancelled' }
  if (typeof value.etag !== 'string' || !value.etag) throw new Error('Google Calendar returned an event without a revision.')
  return { id: value.id, kind: 'event', etag: value.etag, start: point(value.start), end: point(value.end) }
}

/** Read a whole provider delta before the caller advances its cursor. Imported entries contain no private titles or attendees. */
export async function readGoogleCalendarChanges({
  accessToken, calendarId, syncToken, request = fetch,
}: { accessToken: string; calendarId: string; syncToken?: string; request?: Fetch }): Promise<
  { kind: 'complete'; changes: GoogleChange[]; nextSyncToken: string } | { kind: 'reset-required' }
> {
  const url = eventUrl(calendarId)
  url.searchParams.set('fields', 'items(id,status,etag,start,end),nextPageToken,nextSyncToken')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('showDeleted', 'true')
  if (syncToken) url.searchParams.set('syncToken', syncToken)
  const changes = new Map<string, GoogleChange>()
  const pages = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await request(url.href, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 410 && syncToken) return { kind: 'reset-required' }
    if (!response.ok) throw new Error(`Google Calendar list failed with status ${response.status}.`)
    const body: unknown = await response.json()
    if (!isRecord(body) || (body.items !== undefined && !Array.isArray(body.items))) throw new Error('Google Calendar returned an invalid page.')
    for (const item of (body.items as unknown[] | undefined) ?? []) {
      const entry = change(item)
      changes.set(entry.id, entry)
    }
    if (typeof body.nextPageToken === 'string' && body.nextPageToken) {
      if (pages.has(body.nextPageToken)) throw new Error('Google Calendar repeated its page token.')
      pages.add(body.nextPageToken)
      url.searchParams.set('pageToken', body.nextPageToken)
      continue
    }
    if (typeof body.nextSyncToken === 'string' && body.nextSyncToken) {
      return { kind: 'complete', changes: [...changes.values()], nextSyncToken: body.nextSyncToken }
    }
    throw new Error('Google Calendar finished without a sync token.')
  }
  throw new Error('Google Calendar exceeded the page limit.')
}

/** Update a linked event only against the last observed revision. The caller must resolve a conflict before retrying. */
export async function updateGoogleCalendarTimes({
  accessToken, calendarId, eventId, etag, start, end, request = fetch,
}: { accessToken: string; calendarId: string; eventId: string; etag: string; start: DatePoint; end: DatePoint; request?: Fetch }): Promise<
  { kind: 'updated'; etag: string } | { kind: 'conflict' } | { kind: 'missing' }
> {
  if (!eventId || !/^"[^"\r\n]+"$/.test(etag)) throw new Error('A linked Google Calendar event and revision are required.')
  const url = eventUrl(calendarId, eventId)
  url.searchParams.set('sendUpdates', 'none')
  url.searchParams.set('fields', 'etag')
  const response = await request(url.href, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify({ start, end }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 412) return { kind: 'conflict' }
  if (response.status === 404 || response.status === 410) return { kind: 'missing' }
  if (!response.ok) throw new Error(`Google Calendar update failed with status ${response.status}.`)
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body.etag !== 'string' || !body.etag) throw new Error('Google Calendar update returned no revision.')
  return { kind: 'updated', etag: body.etag }
}

// ── TWO-WAY SYNC (LIVE-1179, ADR-1976) ──────────────────────────────────────────────────────────
// A window read with only the fields the rule in lib/calendar-sync/plan.ts needs, and the writes it
// makes. Every write on an existing event carries If-Match, so an edit made there in the seconds
// between the read and the write comes back as a conflict instead of being overwritten.

const WINDOW_FIELDS = 'summary,nextPageToken,items(id,etag,status,summary,location,start,end,transparency,extendedProperties/private)'

function remoteEvent(value: unknown): RemoteEvent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.etag !== 'string') return null
  const cancelled = value.status === 'cancelled'
  let start: DatePoint
  let end: DatePoint
  try {
    start = point(value.start)
    end = point(value.end)
  } catch {
    if (!cancelled) return null
    start = end = { date: '1970-01-01' }
  }
  const ext = isRecord(value.extendedProperties) && isRecord(value.extendedProperties.private) ? value.extendedProperties.private : {}
  const text = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    id: value.id,
    etag: value.etag,
    cancelled,
    transparent: value.transparency === 'transparent',
    summary: text(value.summary),
    location: text(value.location),
    start,
    end,
    ...(typeof ext.frequencyEventId === 'string' ? { frequencyEventId: ext.frequencyEventId } : {}),
    ...(typeof ext.frequencyFingerprint === 'string' ? { fingerprint: ext.frequencyFingerprint } : {}),
    ...(ext.frequencyDetached === '1' ? { detached: true } : {}),
  }
}

/** Every event in [timeMin, timeMax), repeats expanded, plus the calendar's own name. */
export async function listGoogleCalendarWindow({
  accessToken, calendarId, timeMin, timeMax, request = fetch,
}: { accessToken: string; calendarId: string; timeMin: string; timeMax: string; request?: Fetch }): Promise<{ label: string | null; events: RemoteEvent[] }> {
  const url = eventUrl(calendarId)
  url.searchParams.set('fields', WINDOW_FIELDS)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('maxResults', '250')
  const events: RemoteEvent[] = []
  let label: string | null = null
  const pages = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await request(url.href, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Google Calendar list failed with status ${response.status}.`)
    const body: unknown = await response.json()
    if (!isRecord(body) || (body.items !== undefined && !Array.isArray(body.items))) throw new Error('Google Calendar returned an invalid page.')
    if (typeof body.summary === 'string') label = body.summary.slice(0, 300)
    for (const item of (body.items as unknown[] | undefined) ?? []) {
      const entry = remoteEvent(item)
      if (entry) events.push(entry)
    }
    if (typeof body.nextPageToken !== 'string' || !body.nextPageToken) return { label, events }
    if (pages.has(body.nextPageToken)) throw new Error('Google Calendar repeated its page token.')
    pages.add(body.nextPageToken)
    url.searchParams.set('pageToken', body.nextPageToken)
  }
  throw new Error('Google Calendar exceeded the page limit.')
}

type WriteResult = { kind: 'done' } | { kind: 'conflict' } | { kind: 'missing' }

async function write(
  request: Fetch, accessToken: string, url: URL, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, etag?: string,
): Promise<WriteResult> {
  url.searchParams.set('sendUpdates', 'none')
  const response = await request(url.href, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(etag ? { 'If-Match': etag } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  await response.body?.cancel().catch(() => undefined)
  if (response.status === 412) return { kind: 'conflict' }
  if (response.status === 404 || response.status === 410) return { kind: 'missing' }
  if (!response.ok) throw new Error(`Google Calendar ${method} failed with status ${response.status}.`)
  return { kind: 'done' }
}

/** Apply one planned write. A 412 means the copy changed since the read: the next sync lists it. */
export async function applyGoogleCalendarOp({
  accessToken, calendarId, op, request = fetch,
}: { accessToken: string; calendarId: string; op: SyncOp; request?: Fetch }): Promise<WriteResult> {
  switch (op.kind) {
    case 'create':
      return write(request, accessToken, eventUrl(calendarId), 'POST', op.body)
    case 'update':
      return write(request, accessToken, eventUrl(calendarId, op.remoteId), 'PATCH', op.body, op.etag)
    case 'delete':
      return write(request, accessToken, eventUrl(calendarId, op.remoteId), 'DELETE', undefined, op.etag)
    case 'detach':
      return write(request, accessToken, eventUrl(calendarId, op.remoteId), 'PATCH', { extendedProperties: { private: { frequencyEventId: op.eventId, frequencyFingerprint: op.fingerprint, frequencyDetached: '1' } } }, op.etag)
  }
}
