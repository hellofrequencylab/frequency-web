import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

// The capture verifier and signed node codes (LIVE-688, ADR-1654). A check-in is a node capture, so
// this is the gate a forged check-in QR has to pass. Locked here:
//   1. A code this server signed for the node verifies.
//   2. A forged code (signed for another node, or tampered) is refused with bad_signature, whether or
//      not the node ever had an old random secret, inside the grace window or after it.
//   3. After the grace window, a bare /n/<id> (no code) is refused, and so is the node's old secret.

const h = vi.hoisted(() => ({
  node: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) c[m] = () => c
      c.maybeSingle = async () => ({ data: h.node, error: null })
      return c
    },
    rpc: async () => ({ data: true, error: null }),
  }),
}))

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-node-code-secret-0000000000000000'
})

const { verifyCapture } = await import('./verify')
const { signNodeCode, LEGACY_NODE_CODE_GRACE_ENDS } = await import('@/lib/qr/node-code')

const NODE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ACTOR = 'actor-1'

function liveNode(secret: string | null = null) {
  return {
    active: true,
    secret,
    capture_rule: 'repeatable',
    proximity_m: null,
    location: null,
    valid_from: null,
    valid_until: null,
    max_claims: null,
  }
}

beforeEach(() => {
  h.node = liveNode()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('verifyCapture: signed node codes', () => {
  it('accepts a code signed for this node', async () => {
    const r = await verifyCapture({ nodeId: NODE, actorProfileId: ACTOR, presentedSecret: signNodeCode(NODE) })
    expect(r).toEqual({ ok: true })
  })

  it('refuses a code signed for another node (bad_signature)', async () => {
    const r = await verifyCapture({ nodeId: NODE, actorProfileId: ACTOR, presentedSecret: signNodeCode(OTHER) })
    expect(r).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('refuses a tampered code, even on a check-in node that still has its old secret', async () => {
    h.node = liveNode('a1b2c3d4e5f60718293a4b5c6d7e8f90')
    const code = signNodeCode(NODE)
    const tampered = code.slice(0, -2) + (code.endsWith('AA') ? 'BB' : 'AA')
    const r = await verifyCapture({ nodeId: NODE, actorProfileId: ACTOR, presentedSecret: tampered })
    expect(r).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('after the grace window, refuses a bare node id and the old secret, and still accepts a signed code', async () => {
    vi.useFakeTimers({ now: LEGACY_NODE_CODE_GRACE_ENDS + 1000, toFake: ['Date'] })
    const bare = await verifyCapture({ nodeId: NODE, actorProfileId: ACTOR, presentedSecret: null })
    expect(bare).toEqual({ ok: false, reason: 'bad_signature' })

    h.node = liveNode('a1b2c3d4e5f60718293a4b5c6d7e8f90')
    const old = await verifyCapture({
      nodeId: NODE,
      actorProfileId: ACTOR,
      presentedSecret: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    })
    expect(old).toEqual({ ok: false, reason: 'bad_signature' })

    const signed = await verifyCapture({ nodeId: NODE, actorProfileId: ACTOR, presentedSecret: signNodeCode(NODE) })
    expect(signed).toEqual({ ok: true })
  })

  it('inside the grace window, a pre-signing printed code still claims and is logged for reprint', async () => {
    vi.useFakeTimers({ now: LEGACY_NODE_CODE_GRACE_ENDS - 1000, toFake: ['Date'] })
    const r = await verifyCapture({ nodeId: NODE, actorProfileId: ACTOR, presentedSecret: null })
    expect(r).toEqual({ ok: true })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[node-code]'), { nodeId: NODE })
  })
})
