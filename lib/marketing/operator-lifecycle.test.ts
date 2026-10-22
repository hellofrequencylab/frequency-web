import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const state = vi.hoisted(() => ({
  enqueued: [] as { to: string; subject: string; key: string | undefined }[],
  allowed: true,
}))

vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/email')>()),
  enqueueEmail: async (p: { to: string; subject: string }, o?: { dedupeKey?: string }) => {
    state.enqueued.push({ to: p.to, subject: p.subject, key: o?.dedupeKey })
  },
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: state.allowed }) }))
vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

import { operatorDayDue, sendOperatorLifecycle } from './operator-lifecycle'

const NOW = new Date('2026-10-22T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

function admin(spaces: unknown[]): SupabaseClient {
  const chain: Record<string, unknown> = {}
  const q = () => chain
  Object.assign(chain, {
    select: q, eq: q, neq: q, gte: q, order: q,
    limit: () => Promise.resolve({ data: spaces, error: null }),
    maybeSingle: () => Promise.resolve({ data: { display_name: 'Sam', auth_user_id: 'u1' } }),
  })
  return {
    from: () => chain,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'sam@example.com' } } }) } },
  } as unknown as SupabaseClient
}

const space = (id: string, age: number) => ({
  id, name: 'Dune Yoga', slug: id, type: 'business', mode_variant: 'membership', owner_profile_id: 'p1', created_at: ago(age),
})

beforeEach(() => {
  state.enqueued = []
  state.allowed = true
})

describe('operatorDayDue', () => {
  it('is due in the day after day 1, 3 and 7, and nothing between', () => {
    expect(operatorDayDue(0.5)).toBeNull()
    expect(operatorDayDue(1.2)).toBe(1)
    expect(operatorDayDue(2.1)).toBeNull()
    expect(operatorDayDue(3.5)).toBe(3)
    expect(operatorDayDue(4.2)).toBeNull()
    expect(operatorDayDue(7.1)).toBe(7)
    expect(operatorDayDue(8.5)).toBeNull()
  })
})

describe('sendOperatorLifecycle', () => {
  it('sends one email per due Space, keyed on the Space and the day', async () => {
    const r = await sendOperatorLifecycle(admin([space('a', 1.1), space('b', 4), space('c', 3.2)]), { limit: 50, now: NOW })
    expect(r).toEqual({ sent: 2, skipped: 1, failed: 0 })
    expect(state.enqueued.map((e) => e.key)).toEqual(['operator_lifecycle:a:1', 'operator_lifecycle:c:3'])
    expect(state.enqueued[0].to).toBe('sam@example.com')
  })

  it('sends nothing when the send gate says no', async () => {
    state.allowed = false
    const r = await sendOperatorLifecycle(admin([space('a', 1.1)]), { limit: 50, now: NOW })
    expect(r).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(state.enqueued).toEqual([])
  })
})
