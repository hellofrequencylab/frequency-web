import { describe, expect, it } from 'vitest'
import {
  DRAFT_TTL_MS,
  DRAFT_VERSION,
  readDraft,
  refuseNamedSecrets,
  writeDraft,
  type SparkDraft,
  type StorageLike,
} from './draft-store'
import {
  CLOCK_SKEW_MS,
  IDLE_GATE,
  SERVER_BACKOFF_MS,
  SERVER_SYNC_MS,
  afterFailure,
  afterPush,
  mayPush,
  reconcileDrafts,
  sameAnswers,
  type ServerDraft,
} from './draft-sync'

// The reconcile is the one place cross-device drafts can do real harm, so it is the one place
// tested exhaustively. The property under test throughout: NEWEST WINS, BUT NEVER SILENTLY. A
// `conflict` outcome is the only correct answer whenever taking the newer copy would throw away
// writing the author has not been shown.

const NOW = 1_800_000_000_000
const MINUTE = 60_000

const local = (over: Partial<SparkDraft> = {}): SparkDraft => ({
  v: DRAFT_VERSION,
  scope: 'journeys-new.new-journey',
  savedAt: NOW - 10 * MINUTE,
  step: 2,
  values: { 'f.answers-who': 'people who quit last time' },
  ...over,
})

const server = (over: Partial<ServerDraft> = {}): ServerDraft => ({
  scope: 'journeys-new.new-journey',
  savedAt: NOW - 10 * MINUTE,
  step: 2,
  values: { 'f.answers-who': 'people who quit last time' },
  ...over,
})

describe('sameAnswers', () => {
  it('ignores key order and compares by value', () => {
    expect(sameAnswers({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
    expect(sameAnswers({ a: '1' }, { a: '2' })).toBe(false)
    expect(sameAnswers({ a: '1' }, { a: '1', b: '' })).toBe(false)
  })

  it('does not treat an inherited key as a present one', () => {
    expect(sameAnswers({ toString: 'x' }, {})).toBe(false)
  })
})

describe('reconcile — nothing to decide', () => {
  it('opens clean when neither side has anything', () => {
    expect(reconcileDrafts(null, null, NOW)).toEqual({ outcome: 'none' })
  })

  it('treats an empty draft on either side as no draft', () => {
    expect(reconcileDrafts(local({ values: {} }), null, NOW).outcome).toBe('none')
    expect(reconcileDrafts(null, server({ values: {} }), NOW).outcome).toBe('none')
  })

  it('offers the local copy when only this device has one', () => {
    const l = local()
    expect(reconcileDrafts(l, null, NOW)).toEqual({ outcome: 'local', draft: l })
  })

  it('offers the server copy when this device has nothing to lose', () => {
    const s = server()
    expect(reconcileDrafts(null, s, NOW)).toEqual({ outcome: 'server', draft: s })
  })
})

describe('reconcile — newest wins', () => {
  it('never asks when the two copies say the same thing, however old the local one is', () => {
    const verdict = reconcileDrafts(
      local({ savedAt: NOW - 6 * 60 * MINUTE }),
      server({ savedAt: NOW - MINUTE }),
      NOW,
    )
    expect(verdict.outcome).toBe('local')
  })

  it('keeps the local copy when it is the newer one', () => {
    const l = local({ savedAt: NOW - MINUTE, values: { 'f.a': 'typed here, not yet pushed' } })
    const verdict = reconcileDrafts(l, server({ savedAt: NOW - 60 * MINUTE }), NOW)
    expect(verdict).toEqual({ outcome: 'local', draft: l })
  })

  it('keeps the local copy when the two timestamps are within clock skew', () => {
    // Two different clocks. A gap this small is not evidence, so the tie goes to the device the
    // author is sitting at rather than to a card nobody can answer usefully.
    const verdict = reconcileDrafts(
      local({ values: { 'f.a': 'here' } }),
      server({ savedAt: NOW - 10 * MINUTE + CLOCK_SKEW_MS - 1, values: { 'f.a': 'there' } }),
      NOW,
    )
    expect(verdict.outcome).toBe('local')
  })
})

describe('reconcile — but never silently', () => {
  it('ASKS when the server copy is newer and says something different', () => {
    const l = local({ savedAt: NOW - 3 * 60 * MINUTE, values: { 'f.a': 'the laptop version' } })
    const s = server({ savedAt: NOW - 5 * MINUTE, values: { 'f.a': 'the phone version' } })
    const verdict = reconcileDrafts(l, s, NOW)
    expect(verdict).toEqual({ outcome: 'conflict', local: l, server: s })
  })

  it('hands BOTH copies to the caller, so neither is thrown away before the author chooses', () => {
    const verdict = reconcileDrafts(
      local({ savedAt: NOW - 3 * 60 * MINUTE, values: { 'f.a': 'one' } }),
      server({ savedAt: NOW - MINUTE, values: { 'f.a': 'two' } }),
      NOW,
    )
    if (verdict.outcome !== 'conflict') throw new Error('expected a conflict')
    expect(verdict.local.values['f.a']).toBe('one')
    expect(verdict.server.values['f.a']).toBe('two')
  })

  it('asks even when the extra answers are additive, because a merge is a document nobody wrote', () => {
    const verdict = reconcileDrafts(
      local({ savedAt: NOW - 3 * 60 * MINUTE, values: { 'f.a': 'one' } }),
      server({ savedAt: NOW - MINUTE, values: { 'f.a': 'one', 'f.b': 'two' } }),
      NOW,
    )
    expect(verdict.outcome).toBe('conflict')
  })
})

describe('reconcile — expiry', () => {
  it('ignores a server copy past the seven-day window', () => {
    const verdict = reconcileDrafts(null, server({ savedAt: NOW - DRAFT_TTL_MS - 1 }), NOW)
    expect(verdict.outcome).toBe('none')
  })

  it('ignores a server copy stamped in the future by a broken clock', () => {
    const verdict = reconcileDrafts(null, server({ savedAt: NOW + DRAFT_TTL_MS + 1 }), NOW)
    expect(verdict.outcome).toBe('none')
  })

  it('ignores an expired LOCAL copy and falls through to the live server one', () => {
    const s = server({ savedAt: NOW - MINUTE })
    const verdict = reconcileDrafts(local({ savedAt: NOW - DRAFT_TTL_MS - 1 }), s, NOW)
    expect(verdict).toEqual({ outcome: 'server', draft: s })
  })

  it('never raises a conflict between two expired copies', () => {
    const verdict = reconcileDrafts(
      local({ savedAt: NOW - DRAFT_TTL_MS - MINUTE, values: { 'f.a': 'one' } }),
      server({ savedAt: NOW - DRAFT_TTL_MS - 1, values: { 'f.a': 'two' } }),
      NOW,
    )
    expect(verdict.outcome).toBe('none')
  })
})

describe('refusals hold on the way to the server', () => {
  // The first gate is `isDraftable`, which sees the live control. This is the second, which sees
  // only the stored key, and it exists because a leaked secret is worse in a database than it is
  // in one browser.
  it('drops named secrets before a row is written', () => {
    const cleaned = refuseNamedSecrets({
      'f.answers-title': 'Morning Sit',
      'f.password': 'hunter2',
      'f.current-passcode': '0000',
      'f.api-key': 'sk-live-1',
      'f.card-number': '4111111111111111',
      'f.cvv': '123',
      'f.ssn': '000-00-0000',
      'f.iban': 'GB00 0000',
      'f.routing': '110000000',
      'f.session-token': 'abc',
      'f.client-secret': 'shh',
    })
    expect(Object.keys(cleaned)).toEqual(['f.answers-title'])
  })

  it('keeps ordinary answers, including ones that merely mention a person', () => {
    const cleaned = refuseNamedSecrets({ 'f.answers-who': 'people', 'f.answers-why': 'because' })
    expect(cleaned).toEqual({ 'f.answers-who': 'people', 'f.answers-why': 'because' })
  })
})

// ── The push gate ────────────────────────────────────────────────────────────────────────────

/** A localStorage stand-in, so the "a server failure leaves the local copy alone" claim is proved
 *  against a real read rather than asserted in a comment. */
function fakeStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('the clobber gate', () => {
  it('refuses to push until the server has ANSWERED the opening read', () => {
    // The whole point: a Spark that could not read what the server holds must never write over it.
    const unheard = { ...IDLE_GATE, dirty: true }
    expect(mayPush(unheard, NOW)).toBe(false)
    expect(mayPush({ ...unheard, ready: true }, NOW)).toBe(true)
  })

  it('refuses to push when nothing has changed since the last one', () => {
    expect(mayPush({ ready: true, dirty: false, nextPushAt: 0 }, NOW)).toBe(false)
  })

  it('holds the cadence at about two seconds rather than pushing on every pause', () => {
    const sent = afterPush({ ready: true, dirty: true, nextPushAt: 0 }, NOW)
    expect(sent.dirty).toBe(false)
    expect(sent.nextPushAt).toBe(NOW + SERVER_SYNC_MS)
    const typedAgain = { ...sent, dirty: true }
    expect(mayPush(typedAgain, NOW + SERVER_SYNC_MS - 1)).toBe(false)
    expect(mayPush(typedAgain, NOW + SERVER_SYNC_MS)).toBe(true)
  })
})

describe('a server failure costs the author nothing', () => {
  it('puts the typing back to UNSENT rather than dropping it, and backs off', () => {
    const failed = afterFailure(afterPush({ ready: true, dirty: true, nextPushAt: 0 }, NOW), NOW)
    expect(failed.dirty).toBe(true)
    expect(failed.ready).toBe(true)
    expect(failed.nextPushAt).toBe(NOW + SERVER_BACKOFF_MS)
    expect(mayPush(failed, NOW + 1)).toBe(false)
    expect(mayPush(failed, NOW + SERVER_BACKOFF_MS)).toBe(true)
  })

  it('leaves the local copy exactly where it was', () => {
    const store = fakeStorage()
    writeDraft(store, 'journeys-new.new-journey', { step: 2, values: { 'f.a': 'an hour of writing' } }, NOW)
    // Everything the failure path does, in order. None of it can reach the store.
    afterFailure(afterPush({ ready: true, dirty: true, nextPushAt: 0 }, NOW), NOW)
    expect(readDraft(store, 'journeys-new.new-journey', NOW)?.values).toEqual({ 'f.a': 'an hour of writing' })
  })

  it('leaves a local-only session able to keep typing forever', () => {
    // The gate never opens, so nothing is ever pushed, and the local write path is untouched.
    let gate = IDLE_GATE
    const store = fakeStorage()
    for (const word of ['one', 'one two', 'one two three']) {
      writeDraft(store, 's', { step: 1, values: { 'f.a': word } }, NOW)
      gate = { ...gate, dirty: true }
      expect(mayPush(gate, NOW)).toBe(false)
    }
    expect(readDraft(store, 's', NOW)?.values).toEqual({ 'f.a': 'one two three' })
  })
})
