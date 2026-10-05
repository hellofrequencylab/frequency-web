import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

// Signed node codes (LIVE-688, ADR-1654). What is locked here (crypto-only, no network):
//   1. ROUND-TRIP: a code signed for a node verifies for that node, and the URL carries it.
//   2. FORGERY: a code for another node, a tampered tag, a tampered issue time, a future issue
//      time, and garbage all fail closed.
//   3. GRACE: a pre-signing printed code (no `?s=`, or the node's old random secret) claims only
//      before LEGACY_NODE_CODE_GRACE_ENDS; a tampered signed code never falls back to legacy.
//   4. FAIL CLOSED: in production with no key, signing throws and verification refuses.

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-node-code-secret-0000000000000000'
})

const { signNodeCode, signedNodeUrl, verifyNodeCode, nodeCodeVerdict, LEGACY_NODE_CODE_GRACE_ENDS } =
  await import('./node-code')

const NODE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ISSUED = Date.parse('2026-09-29T12:00:00Z')
const BEFORE_GRACE_END = LEGACY_NODE_CODE_GRACE_ENDS - 1
const AFTER_GRACE_END = LEGACY_NODE_CODE_GRACE_ENDS + 1

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('node code: round-trip', () => {
  it('verifies for the node it was signed for', () => {
    const code = signNodeCode(NODE, ISSUED)
    expect(code).toMatch(/^v1\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/)
    expect(verifyNodeCode(NODE, code, ISSUED + 1000)).toBe(true)
  })

  it('still verifies long after issue (a printed code does not expire on its own)', () => {
    const code = signNodeCode(NODE, ISSUED)
    expect(verifyNodeCode(NODE, code, ISSUED + 5 * 365 * 24 * 3600 * 1000)).toBe(true)
  })

  it('puts the signed code on the /n/<id> URL', () => {
    const url = new URL(signedNodeUrl(NODE, ISSUED))
    expect(url.pathname).toBe(`/n/${NODE}`)
    expect(verifyNodeCode(NODE, url.searchParams.get('s'), ISSUED)).toBe(true)
  })
})

describe('node code: forgery fails closed', () => {
  it('refuses a code signed for another node', () => {
    expect(verifyNodeCode(OTHER, signNodeCode(NODE, ISSUED), ISSUED)).toBe(false)
  })

  it('refuses a tampered tag', () => {
    const code = signNodeCode(NODE, ISSUED)
    const last = code.slice(-1)
    const flipped = code.slice(0, -1) + (last === 'A' ? 'B' : 'A')
    expect(verifyNodeCode(NODE, flipped, ISSUED)).toBe(false)
  })

  it('refuses a tampered issue time', () => {
    const [v, iat, tag] = signNodeCode(NODE, ISSUED).split('.')
    const moved = `${v}.${(parseInt(iat, 36) - 1).toString(36)}.${tag}`
    expect(verifyNodeCode(NODE, moved, ISSUED)).toBe(false)
  })

  it('refuses an issue time in the future', () => {
    const code = signNodeCode(NODE, ISSUED + 60 * 60 * 1000)
    expect(verifyNodeCode(NODE, code, ISSUED)).toBe(false)
  })

  it('refuses garbage', () => {
    for (const junk of [null, undefined, '', 'v1', 'v1..', 'v1.zz.', 'v2.abc.def', 'v1.-1.AAAA', NODE]) {
      expect(verifyNodeCode(NODE, junk, ISSUED)).toBe(false)
    }
  })
})

describe('nodeCodeVerdict: what the capture verifier accepts', () => {
  it('a signed code is accepted before and after the grace window', () => {
    const code = signNodeCode(NODE, ISSUED)
    expect(nodeCodeVerdict({ nodeId: NODE, presented: code, legacySecret: null, now: BEFORE_GRACE_END })).toBe('signed')
    expect(nodeCodeVerdict({ nodeId: NODE, presented: code, legacySecret: 'old', now: AFTER_GRACE_END })).toBe('signed')
  })

  it('a tampered signed code is refused even inside the grace window, even on a node with no old secret', () => {
    const forged = signNodeCode(OTHER, ISSUED)
    expect(nodeCodeVerdict({ nodeId: NODE, presented: forged, legacySecret: null, now: BEFORE_GRACE_END })).toBe('refused')
  })

  it('an unsigned code (the bare node id) claims only inside the grace window', () => {
    expect(nodeCodeVerdict({ nodeId: NODE, presented: null, legacySecret: null, now: BEFORE_GRACE_END })).toBe('legacy')
    expect(nodeCodeVerdict({ nodeId: NODE, presented: null, legacySecret: null, now: AFTER_GRACE_END })).toBe('refused')
    // A node created after signing shipped never had an unsigned code printed: no legacy path.
    expect(
      nodeCodeVerdict({ nodeId: NODE, presented: null, legacySecret: null, nodeCreatedAt: '2026-10-01T00:00:00Z', now: BEFORE_GRACE_END }),
    ).toBe('refused')
    expect(
      nodeCodeVerdict({ nodeId: NODE, presented: null, legacySecret: null, nodeCreatedAt: '2026-09-01T00:00:00Z', now: BEFORE_GRACE_END }),
    ).toBe('legacy')
  })

  it('an old random secret claims only when it matches, and only inside the grace window', () => {
    const legacySecret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    expect(nodeCodeVerdict({ nodeId: NODE, presented: legacySecret, legacySecret, now: BEFORE_GRACE_END })).toBe('legacy')
    expect(nodeCodeVerdict({ nodeId: NODE, presented: 'wrong', legacySecret, now: BEFORE_GRACE_END })).toBe('refused')
    expect(nodeCodeVerdict({ nodeId: NODE, presented: null, legacySecret, now: BEFORE_GRACE_END })).toBe('refused')
    expect(nodeCodeVerdict({ nodeId: NODE, presented: legacySecret, legacySecret, now: AFTER_GRACE_END })).toBe('refused')
  })

  it('the grace window ends before launch day', () => {
    expect(LEGACY_NODE_CODE_GRACE_ENDS).toBeLessThan(Date.parse('2026-12-21T00:00:00Z'))
  })
})

describe('node code: fails closed without a key in production', () => {
  it('signing throws and verification refuses', () => {
    const code = signNodeCode(NODE, ISSUED)
    vi.stubEnv('UNSUBSCRIBE_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => signNodeCode(NODE, ISSUED)).toThrow(/must be set in production/)
    expect(verifyNodeCode(NODE, code, ISSUED)).toBe(false)
  })
})
