type DatePoint = { date: string } | { dateTime: string; timeZone?: string }

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
