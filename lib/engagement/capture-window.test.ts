import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-654 (ADR-1632): a capture credits once per the node's declared window. A repeatable node
// credits once per member day, so two scans on two days credit twice and a double tap the same day
// credits once. Once-per-user and first-scan-only nodes keep the (node, actor) key. The ledger is an
// in-memory set of idempotency keys; the member day is set per test.

const h = vi.hoisted(() => {
  const state = {
    rule: 'repeatable' as string,
    day: '2026-09-29',
    ledger: new Set<string>(),
    awards: [] as number[],
    timeline: [] as string[],
  }
  const builder = (table: string): unknown => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'insert']) c[m] = () => c
    c.maybeSingle = async () =>
      table === 'nodes'
        ? {
            data: { type: 'qr', zaps_value: 5, partner_id: null, kind: 'checkin', space_id: 'space-1', capture_rule: state.rule },
            error: null,
          }
        : { data: null, error: null }
    c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
    return c
  }
  return { state, admin: { from: (table: string) => builder(table) } }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('./verify', () => ({ verifyCapture: vi.fn(async () => ({ ok: true })) }))
vi.mock('./events', () => ({
  recordEngagementEvent: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => {
    if (h.state.ledger.has(idempotencyKey)) return { recorded: false, id: null }
    h.state.ledger.add(idempotencyKey)
    return { recorded: true, id: `ev-${h.state.ledger.size}` }
  }),
}))
vi.mock('@/lib/member-day', () => ({ resolveMemberDay: vi.fn(async () => h.state.day) }))
vi.mock('@/lib/zaps', () => ({ awardZaps: vi.fn(async (_p: string, amount: number) => void h.state.awards.push(amount)) }))
vi.mock('@/lib/trust', () => ({ trustSource: () => ({ signal: async () => {} }) }))
vi.mock('@/lib/crm/interactions', () => ({
  recordSpaceMemberActivity: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) => {
    if (!h.state.timeline.includes(idempotencyKey)) h.state.timeline.push(idempotencyKey)
  }),
}))

import { captureNode, captureWindowKey } from './capture'

const attempt = { nodeId: 'node-1', actorProfileId: 'me' }

describe('captureNode repeatable window (LIVE-654)', () => {
  beforeEach(() => {
    h.state.rule = 'repeatable'
    h.state.day = '2026-09-29'
    h.state.ledger = new Set()
    h.state.awards = []
    h.state.timeline = []
  })

  it('credits a repeatable node on each of two days', async () => {
    expect(await captureNode(attempt)).toMatchObject({ ok: true, zapsAwarded: 5 })
    h.state.day = '2026-09-30'
    expect(await captureNode(attempt)).toMatchObject({ ok: true, zapsAwarded: 5 })
    expect(h.state.awards).toEqual([5, 5])
    // The Space check-in timeline logs both days too.
    expect(h.state.timeline).toHaveLength(2)
  })

  it('credits a double tap on a repeatable node once', async () => {
    expect(await captureNode(attempt)).toMatchObject({ ok: true })
    expect(await captureNode(attempt)).toMatchObject({ ok: false, reason: 'already_captured' })
    expect(h.state.awards).toEqual([5])
    expect(h.state.timeline).toHaveLength(1)
  })

  it('keeps a once-per-user node at one credit ever, across days', async () => {
    h.state.rule = 'once_per_user'
    expect(await captureNode(attempt)).toMatchObject({ ok: true })
    h.state.day = '2026-09-30'
    expect(await captureNode(attempt)).toMatchObject({ ok: false, reason: 'already_captured' })
    expect(h.state.awards).toEqual([5])
  })
})

describe('captureWindowKey', () => {
  it('appends the member day only for a repeatable node', () => {
    expect(captureWindowKey('n', 'a', 'repeatable', '2026-09-29')).toBe('n:a:2026-09-29')
    expect(captureWindowKey('n', 'a', 'once_per_user', '2026-09-29')).toBe('n:a')
    expect(captureWindowKey('n', 'a', 'once_global', null)).toBe('n:a')
    expect(captureWindowKey('n', 'a', 'repeatable', null)).toBe('n:a')
  })
})
