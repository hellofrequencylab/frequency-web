import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const state = vi.hoisted(() => ({
  enqueued: [] as { to: string; subject: string; key: string | undefined; headers?: Record<string, string> }[],
  allowed: true,
  // undefined = the inventory read failed (loadInventory returns null); otherwise the sections it hands back.
  inventory: undefined as unknown,
}))

vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/email')>()),
  enqueueEmail: async (p: { to: string; subject: string; headers?: Record<string, string> }, o?: { dedupeKey?: string }) => {
    state.enqueued.push({ to: p.to, subject: p.subject, key: o?.dedupeKey, headers: p.headers })
  },
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: state.allowed }) }))
vi.mock('@/lib/launch/inventory-io', () => ({ loadInventory: async () => (state.inventory ? { sections: state.inventory, space: { id: 'x', slug: 'x', name: 'x' } } : null) }))
vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))
// EMAIL-064: the cross-email cap. 'reserved' unless a test says otherwise (what the real module answers with the cap off).
const cap = vi.hoisted(() => ({ answer: 'reserved' as string, reserved: [] as Record<string, unknown>[], released: [] as string[] }))
vi.mock('@/lib/lifecycle/cap-io', () => ({
  reserveLifecycleSend: async (_admin: unknown, input: Record<string, unknown>) => {
    cap.reserved.push(input)
    return cap.answer
  },
  releaseLifecycleSend: async (_admin: unknown, key: string) => {
    cap.released.push(key)
  },
}))

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
  // eslint-disable-next-line no-restricted-syntax -- a hand-built mock client for a function that takes the injected client
  } as unknown as SupabaseClient
}

const space = (id: string, age: number) => ({
  id, name: 'Dune Yoga', slug: id, type: 'business', mode_variant: 'membership', owner_profile_id: 'p1', created_at: ago(age),
})

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-operator-lifecycle-unsubscribe-063')
  state.enqueued = []
  state.allowed = true
  state.inventory = undefined
  cap.answer = 'reserved'
  cap.reserved = []
  cap.released = []
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
    // EMAIL-063: one-click unsubscribe on lifecycle mail, no sign-in needed.
    expect(state.enqueued[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(state.enqueued[0].headers?.['List-Unsubscribe']).toMatch(/\/api\/unsubscribe\?p=.*&c=lifecycle&t=/)
  })

  it('sends nothing when the send gate says no', async () => {
    state.allowed = false
    const r = await sendOperatorLifecycle(admin([space('a', 1.1)]), { limit: 50, now: NOW })
    expect(r).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(state.enqueued).toEqual([])
  })
})

describe('the cross-email cap (EMAIL-064)', () => {
  it('reserves with the registry kind and the outbox key right before the send', async () => {
    await sendOperatorLifecycle(admin([space('a', 1.1)]), { limit: 50, now: NOW })
    expect(cap.reserved).toEqual([{ recipient: 'sam@example.com', profileId: 'p1', kind: 'operator_lifecycle', dedupeKey: 'operator_lifecycle:a:1' }])
    expect(state.enqueued).toHaveLength(1)
  })

  it('sends nothing when the cap holds it, cannot be read, or says the day already went out', async () => {
    for (const answer of ['capped', 'error', 'duplicate']) {
      cap.answer = answer
      const r = await sendOperatorLifecycle(admin([space('a', 1.1)]), { limit: 50, now: NOW })
      expect(r).toEqual({ sent: 0, skipped: 1, failed: 0 })
    }
    expect(state.enqueued).toEqual([])
  })

  it('does not spend the cap when the send gate says no', async () => {
    state.allowed = false
    await sendOperatorLifecycle(admin([space('a', 1.1)]), { limit: 50, now: NOW })
    expect(cap.reserved).toEqual([])
  })
})

describe('smart days (next best step)', () => {
  const todo = (id: string, label: string) => [{ id: 'space', title: 'Space', items: [{ id, label, state: 'todo' }] }]

  it('names the next step on day 1, still keyed on the Space and the day', async () => {
    state.inventory = todo('sc-tag', 'Tagline')
    const r = await sendOperatorLifecycle(admin([space('a', 1.1)]), { limit: 50, now: NOW })
    expect(r.sent).toBe(1)
    expect(state.enqueued[0].key).toBe('operator_lifecycle:a:1')
    expect(state.enqueued[0].subject).toBe('One small thing left on your page.')
  })

  it('skips the email when nothing is left to do', async () => {
    state.inventory = [{ id: 'space', title: 'Space', items: [{ id: 'sc-tag', label: 'Tagline', state: 'done' }] }]
    const r = await sendOperatorLifecycle(admin([space('a', 3.2)]), { limit: 50, now: NOW })
    expect(r).toEqual({ sent: 0, skipped: 1, failed: 0 })
    expect(state.enqueued).toEqual([])
  })

  it('falls back to the fixed copy when the inventory read fails', async () => {
    state.inventory = undefined
    await sendOperatorLifecycle(admin([space('a', 3.2)]), { limit: 50, now: NOW })
    expect(state.enqueued[0].subject).toBe('Three days in. Invite your regulars.')
  })
})
