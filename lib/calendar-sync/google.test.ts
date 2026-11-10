import { describe, expect, it, vi } from 'vitest'
import { readGoogleCalendarChanges, updateGoogleCalendarTimes } from './google'

const auth = { accessToken: 'fixture-token', calendarId: 'calendar@example.test' }
const start = { date: '2026-11-09' }
const end = { date: '2026-11-10' }
const event = { id: 'remote', etag: '"version-1"', start, end }

describe('Google Calendar delta and conditional update', () => {
  it('uses the final cursor after all pages and returns only availability fields', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [{ ...event, summary: 'private' }], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'removed', status: 'cancelled' }], nextSyncToken: 'cursor-2' }))
    await expect(readGoogleCalendarChanges({ ...auth, syncToken: 'cursor-1', request })).resolves.toEqual({
      kind: 'complete',
      changes: [{ ...event, kind: 'event' }, { id: 'removed', kind: 'cancelled' }],
      nextSyncToken: 'cursor-2',
    })
    const second = new URL(String(request.mock.calls[1][0]))
    expect(second.searchParams.get('pageToken')).toBe('page-2')
    expect(second.searchParams.get('syncToken')).toBe('cursor-1')
  })

  it('requests a full refresh on 410 and rejects pages with no final cursor', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 410 }))
    await expect(readGoogleCalendarChanges({ ...auth, syncToken: 'expired', request })).resolves.toEqual({ kind: 'reset-required' })
    request.mockResolvedValueOnce(Response.json({ items: [event] }))
    await expect(readGoogleCalendarChanges({ ...auth, request })).rejects.toThrow('without a sync token')
  })

  it('uses an exact revision, suppresses notifications, and surfaces concurrent edits', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 412 }))
    await expect(updateGoogleCalendarTimes({ ...auth, eventId: event.id, etag: event.etag, start, end, request })).resolves.toEqual({ kind: 'conflict' })
    const [url, options] = request.mock.calls[0]
    expect(new URL(String(url)).searchParams.get('sendUpdates')).toBe('none')
    expect(options?.headers).toMatchObject({ 'If-Match': event.etag })
    expect(options?.body).toBe(JSON.stringify({ start, end }))
  })
})
