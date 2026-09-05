import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-05 (2026-09-05): a host's event update must not fan out push / email / SMS until the
// page-side record exists. Before this, both inserts in composeEventDispatch were read as
// `const { data }` with no `error`, and the fan-out ran unconditionally after them, so a refused
// write still pushed the whole audience while the event page showed nothing. The order under test:
// dispatches row, event_dispatches row, THEN fan-out; a failed write returns 'write-failed' and
// sends nothing; a thrown fan-out after the writes returns 'send-failed' with the ids intact.

const calls: string[] = []

const {
  dispatchesInsert,
  eventDispatchesInsert,
  dispatchesDelete,
  resolveEventDispatchAudience,
  routeNotification,
  sendEventUpdateEmail,
  resolveSendGate,
} = vi.hoisted(() => ({
  dispatchesInsert: vi.fn(),
  eventDispatchesInsert: vi.fn(),
  dispatchesDelete: vi.fn(),
  resolveEventDispatchAudience: vi.fn(),
  routeNotification: vi.fn(),
  sendEventUpdateEmail: vi.fn(),
  resolveSendGate: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            calls.push(`insert:${table}`)
            return table === 'dispatches' ? dispatchesInsert(row) : eventDispatchesInsert(row)
          },
        }),
      }),
      delete: () => ({
        eq: async (col: string, val: string) => {
          calls.push(`delete:${table}`)
          return dispatchesDelete(col, val)
        },
      }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        in: async () => ({ data: [], error: null }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}))
vi.mock('@/lib/events/dispatch-audience', () => ({ resolveEventDispatchAudience }))
vi.mock('@/lib/notifications/router', () => ({ routeNotification }))
vi.mock('@/lib/email', () => ({ sendEventUpdateEmail }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate }))
vi.mock('@/lib/comms/sms', () => ({ sendSms: vi.fn(), isSmsProvisioned: () => false }))

import { composeEventDispatch, describeDispatchOutcome } from './dispatch'

const ARGS = {
  eventId: 'ev-1',
  authorId: 'host-1',
  title: 'Doors moved',
  body: 'We open at 7 now.',
  toPage: true,
  toDispatch: true,
  eventUrl: '/events/full-moon',
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  dispatchesInsert.mockResolvedValue({ data: { id: 'disp-1' }, error: null })
  eventDispatchesInsert.mockResolvedValue({ data: { id: 'ed-1' }, error: null })
  dispatchesDelete.mockResolvedValue({ error: null })
  resolveEventDispatchAudience.mockImplementation(async () => {
    calls.push('fanout')
    return ['g1', 'g2']
  })
  routeNotification.mockResolvedValue({ enqueuedCount: 1 })
})

describe('composeEventDispatch order: write, then fan out', () => {
  it('sends nothing and returns write-failed when the dispatches insert is refused', async () => {
    dispatchesInsert.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } })
    const res = await composeEventDispatch(ARGS)
    expect(res.status).toBe('write-failed')
    expect(res.dispatchId).toBeNull()
    expect(res.eventDispatchId).toBeNull()
    expect(res.enqueued).toBe(0)
    expect(eventDispatchesInsert).not.toHaveBeenCalled()
    expect(resolveEventDispatchAudience).not.toHaveBeenCalled()
    expect(routeNotification).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[event-dispatch] dispatches insert failed',
      expect.objectContaining({ eventId: 'ev-1', code: '42501' }),
    )
  })

  it('sends nothing, removes the orphan Dispatch row, and returns write-failed when the page record is refused', async () => {
    eventDispatchesInsert.mockResolvedValue({ data: null, error: { message: 'statement timeout', code: '57014' } })
    const res = await composeEventDispatch(ARGS)
    expect(res.status).toBe('write-failed')
    expect(res.eventDispatchId).toBeNull()
    expect(res.dispatchId).toBeNull()
    expect(dispatchesDelete).toHaveBeenCalledWith('id', 'disp-1')
    expect(resolveEventDispatchAudience).not.toHaveBeenCalled()
    expect(routeNotification).not.toHaveBeenCalled()
    expect(calls).toEqual(['insert:dispatches', 'insert:event_dispatches', 'delete:dispatches'])
  })

  it('fans out only after both records exist, and reports ok', async () => {
    const res = await composeEventDispatch(ARGS)
    expect(res.status).toBe('ok')
    expect(res.dispatchId).toBe('disp-1')
    expect(res.eventDispatchId).toBe('ed-1')
    expect(res.enqueued).toBe(2)
    expect(calls).toEqual(['insert:dispatches', 'insert:event_dispatches', 'fanout'])
    expect(eventDispatchesInsert).toHaveBeenCalledWith(expect.objectContaining({ dispatch_id: 'disp-1', event_id: 'ev-1' }))
  })

  it('returns send-failed with the ids intact when the fan-out throws after the writes', async () => {
    resolveEventDispatchAudience.mockRejectedValue(new Error('audience read failed'))
    const res = await composeEventDispatch(ARGS)
    expect(res.status).toBe('send-failed')
    expect(res.dispatchId).toBe('disp-1')
    expect(res.eventDispatchId).toBe('ed-1')
    expect(res.enqueued).toBe(0)
    expect(dispatchesDelete).not.toHaveBeenCalled()
  })

  it('a page-only update writes the page record and pushes nothing', async () => {
    const res = await composeEventDispatch({ ...ARGS, toDispatch: false })
    expect(res.status).toBe('ok')
    expect(dispatchesInsert).not.toHaveBeenCalled()
    expect(res.eventDispatchId).toBe('ed-1')
    expect(resolveEventDispatchAudience).not.toHaveBeenCalled()
  })
})

describe('describeDispatchOutcome (the Manage broadcast line)', () => {
  const base = { eventDispatchId: 'ed-1', dispatchId: 'disp-1', enqueued: 3, smsRequested: false, smsSent: 0, emailSent: 0 }

  it('says posted AND sent only when both happened', () => {
    expect(describeDispatchOutcome({ ...base, status: 'ok' })).toEqual({
      ok: true,
      detail: 'Posted to the event page and sent as a Dispatch to the whole event audience.',
    })
  })

  it('says the page post landed and the send did not when the fan-out failed after the write', () => {
    expect(describeDispatchOutcome({ ...base, status: 'send-failed' })).toEqual({
      ok: false,
      detail: 'Posted to the event page. The send did not go out; try again.',
    })
  })

  it('is a plain failure when nothing was written', () => {
    const r = describeDispatchOutcome({ ...base, eventDispatchId: null, dispatchId: null, status: 'write-failed' })
    expect(r.ok).toBe(false)
    expect(r.detail).not.toContain('sent')
  })
})
