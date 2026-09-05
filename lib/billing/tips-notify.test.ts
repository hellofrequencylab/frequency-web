import { describe, it, expect, beforeEach, vi } from 'vitest'

// The recipient's half of a tip (lib/billing/tips-notify.ts, scan2 L9-05). Locks:
//   1. notifyTipRecipient writes ONE bell row for the recipient carrying the amount and the tipper
//      (actor + profile link), and enqueues ONE email through the outbox with the same two facts.
//   2. A tip with no sender is "Someone" in both channels and links to nobody.
//   3. A suppressed address gets the bell and no email; nothing here ever throws.
//   4. listTipsReceived totals every succeeded tip and lists the most recent with the tipper's
//      name, and a refused read comes back empty rather than as a false zero.

const m = vi.hoisted(() => ({
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  gateAllowed: true,
  profiles: new Map<string, { display_name: string | null; auth_user_id: string | null }>(),
  tipsRows: [] as Record<string, unknown>[],
  tipsError: null as null | { message: string },
  tipsFilters: [] as [string, unknown][],
}))

vi.mock('@/lib/email', () => ({ enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p) }))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async () => ({ allowed: m.gateAllowed, reason: m.gateAllowed ? 'ok' : 'suppressed' }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }) } },
    from: (table: string) => {
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({ data: m.profiles.get(id) ?? null, error: null }),
            }),
            in: async (_c: string, ids: string[]) => ({
              data: ids.filter((id) => m.profiles.has(id)).map((id) => ({ id, display_name: m.profiles.get(id)!.display_name })),
              error: null,
            }),
          }),
        }
      }
      if (table === 'tips') {
        return {
          select: () => ({
            eq: (c1: string, v1: unknown) => ({
              eq: (c2: string, v2: unknown) => ({
                order: async () => {
                  m.tipsFilters.push([c1, v1], [c2, v2])
                  return { data: m.tipsError ? null : m.tipsRows, error: m.tipsError }
                },
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { notifyTipRecipient, listTipsReceived, ANONYMOUS_TIPPER, TIP_NOTIFICATION_TYPE } from './tips-notify'

const tip = {
  id: 'tip-1',
  to_profile_id: 'host-1',
  from_profile_id: 'fan-1',
  amount_cents: 500,
  currency: 'usd',
  message: 'Thanks for Tuesday',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.gateAllowed = true
  m.profiles.clear()
  m.profiles.set('fan-1', { display_name: 'Ada Lovelace', auth_user_id: 'u-fan' })
  m.profiles.set('host-1', { display_name: 'Grace Hopper', auth_user_id: 'u-host' })
  m.tipsRows = []
  m.tipsError = null
  m.tipsFilters.length = 0
})

describe('notifyTipRecipient', () => {
  it('writes one bell row for the recipient with the amount and the tipper, and enqueues one email', async () => {
    await notifyTipRecipient(tip)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'host-1',
      actor_id: 'fan-1',
      type: TIP_NOTIFICATION_TYPE,
      reference_type: 'profile',
      reference_id: 'fan-1',
      body: 'sent you a $5 tip',
    })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    const email = m.enqueueEmail.mock.calls[0][0]
    expect(email.to).toBe('u-host@example.com')
    expect(email.subject).toBe('Ada Lovelace sent you a $5 tip')
    expect(String(email.text)).toContain('Thanks for Tuesday')
    expect(String(email.html)).toContain('$5')
  })

  it('a tip with no sender is "Someone" in both channels and links to nobody', async () => {
    await notifyTipRecipient({ ...tip, from_profile_id: null, message: null })
    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      actor_id: null,
      reference_id: null,
      body: `${ANONYMOUS_TIPPER} sent you a $5 tip`,
    })
    expect(m.enqueueEmail.mock.calls[0][0].subject).toBe(`${ANONYMOUS_TIPPER} sent you a $5 tip`)
  })

  it('a suppressed address still gets the bell and no email', async () => {
    m.gateAllowed = false
    await notifyTipRecipient(tip)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(m.enqueueEmail).not.toHaveBeenCalled()
  })

  it('never throws when the outbox refuses the email', async () => {
    m.enqueueEmail.mockRejectedValueOnce(new Error('enqueue(email) failed'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyTipRecipient(tip)).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('listTipsReceived', () => {
  it('reads only the member\'s succeeded tips, totals them all, and names each tipper', async () => {
    m.tipsRows = [
      { id: 't1', amount_cents: 500, currency: 'usd', message: 'hi', from_profile_id: 'fan-1', succeeded_at: '2026-09-01T00:00:00Z' },
      { id: 't2', amount_cents: 1000, currency: 'usd', message: null, from_profile_id: null, succeeded_at: '2026-08-01T00:00:00Z' },
      { id: 't3', amount_cents: 300, currency: 'usd', message: null, from_profile_id: 'fan-1', succeeded_at: '2026-07-01T00:00:00Z' },
    ]
    const r = await listTipsReceived('host-1', 2)
    expect(m.tipsFilters).toEqual([['to_profile_id', 'host-1'], ['status', 'succeeded']])
    expect(r.totalCents).toBe(1800)
    expect(r.count).toBe(3)
    expect(r.recent.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(r.recent[0].tipperName).toBe('Ada Lovelace')
    expect(r.recent[1].tipperName).toBe(ANONYMOUS_TIPPER)
  })

  it('a refused read comes back empty, not as a false zero balance that hides the error', async () => {
    m.tipsError = { message: 'permission denied' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await listTipsReceived('host-1')
    expect(r).toEqual({ totalCents: 0, count: 0, recent: [] })
    expect(errSpy).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })
})
