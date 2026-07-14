import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  evaluateSendGate,
  consentScopeForCategory,
  resolveSendGate,
  type SendGateInput,
} from './send-gate'

// ── The pure gate: exhaustive truth table ────────────────────────────────────
//
// This is the ADR-028 harness. Every guardrail must independently deny, the
// precedence order must hold, and the only path to `allowed` is all-clear.

const allClear: SendGateInput = {
  channel: 'email',
  category: 'lifecycle',
  prefEnabled: true,
  consentGranted: true,
  suppressed: false,
  sentInWindow: 0,
  cap: Infinity,
}

describe('evaluateSendGate — the one path to allowed', () => {
  it('allows only when every guardrail is clear', () => {
    expect(evaluateSendGate(allClear)).toEqual({ allowed: true, reason: 'ok' })
  })
})

describe('evaluateSendGate — each guardrail denies independently', () => {
  it('suppression blocks', () => {
    expect(evaluateSendGate({ ...allClear, suppressed: true })).toEqual({
      allowed: false,
      reason: 'suppressed',
    })
  })

  it('missing consent blocks', () => {
    expect(evaluateSendGate({ ...allClear, consentGranted: false })).toEqual({
      allowed: false,
      reason: 'no_consent',
    })
  })

  it('preference off blocks', () => {
    expect(evaluateSendGate({ ...allClear, prefEnabled: false })).toEqual({
      allowed: false,
      reason: 'pref_off',
    })
  })

  it('frequency cap blocks at the cap', () => {
    expect(evaluateSendGate({ ...allClear, sentInWindow: 3, cap: 3 })).toEqual({
      allowed: false,
      reason: 'frequency_cap',
    })
  })

  it('one under the cap is allowed; the cap itself is not', () => {
    expect(evaluateSendGate({ ...allClear, sentInWindow: 2, cap: 3 }).allowed).toBe(true)
    expect(evaluateSendGate({ ...allClear, sentInWindow: 3, cap: 3 }).allowed).toBe(false)
    expect(evaluateSendGate({ ...allClear, sentInWindow: 4, cap: 3 }).allowed).toBe(false)
  })
})

describe('evaluateSendGate — Phase 6 gates', () => {
  it('transactional bypasses consent + preference + frequency (only suppression stops it)', () => {
    expect(
      evaluateSendGate({
        ...allClear,
        category: 'transactional',
        transactional: true,
        consentGranted: false,
        prefEnabled: false,
        subjectMuted: true,
        frequencyDeferred: true,
        sentInWindow: 99,
        cap: 1,
      }),
    ).toEqual({ allowed: true, reason: 'ok' })
  })

  it('a suppressed address still blocks even a transactional send', () => {
    expect(
      evaluateSendGate({ ...allClear, transactional: true, suppressed: true }),
    ).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it('a per-subject mute blocks (global pref still on)', () => {
    expect(evaluateSendGate({ ...allClear, subjectMuted: true })).toEqual({
      allowed: false,
      reason: 'subject_muted',
    })
  })

  it('a digest choice defers the realtime send', () => {
    expect(evaluateSendGate({ ...allClear, frequencyDeferred: true })).toEqual({
      allowed: false,
      reason: 'frequency_deferred',
    })
  })

  it('subject mute outranks frequency deferral', () => {
    expect(
      evaluateSendGate({ ...allClear, subjectMuted: true, frequencyDeferred: true }).reason,
    ).toBe('subject_muted')
  })
})

describe('evaluateSendGate — precedence (the most fundamental block wins)', () => {
  // When several guardrails fail at once, the reason reported is the highest-precedence
  // one: suppression > consent > preference > frequency. This matters for audit clarity.
  const everythingWrong: SendGateInput = {
    ...allClear,
    prefEnabled: false,
    consentGranted: false,
    suppressed: true,
    sentInWindow: 99,
    cap: 1,
  }

  it('suppression outranks all', () => {
    expect(evaluateSendGate(everythingWrong).reason).toBe('suppressed')
  })

  it('consent outranks preference + frequency', () => {
    expect(evaluateSendGate({ ...everythingWrong, suppressed: false }).reason).toBe('no_consent')
  })

  it('preference outranks frequency', () => {
    expect(
      evaluateSendGate({ ...everythingWrong, suppressed: false, consentGranted: true }).reason,
    ).toBe('pref_off')
  })
})

// ── Category → consent scope mapping ─────────────────────────────────────────

describe('consentScopeForCategory', () => {
  it('lifecycle requires the lifecycle scope', () => {
    expect(consentScopeForCategory('lifecycle')).toBe('email_lifecycle')
  })

  it('marketing requires the marketing scope', () => {
    expect(consentScopeForCategory('marketing')).toBe('email_marketing')
  })

  it('community notifications are preference-governed (no extra consent scope)', () => {
    expect(consentScopeForCategory('dispatches')).toBeNull()
    expect(consentScopeForCategory('events')).toBeNull()
    expect(consentScopeForCategory('mentions')).toBeNull()
  })
})

// ── The async resolver: composes the live readers, fails closed ──────────────

// Controllable mocks of the three guardrail readers. The resolver is the IO seam;
// these assert it wires consent/suppression/preferences into the pure gate correctly.
const mocks = vi.hoisted(() => ({
  shouldSend: vi.fn(),
  hasConsent: vi.fn(),
  isSuppressed: vi.fn(),
  getFrequency: vi.fn(),
  isSubjectTopicMuted: vi.fn(),
}))

vi.mock('@/lib/notification-preferences', () => ({
  shouldSend: mocks.shouldSend,
  getFrequency: mocks.getFrequency,
  isSubjectTopicMuted: mocks.isSubjectTopicMuted,
  // Pure helper — keep the real logic so the resolver's frequency wiring is exercised.
  isFrequencyDeferred: (channel: string, frequency: string) =>
    channel === 'email' && frequency !== 'realtime',
}))
vi.mock('@/lib/consent/consent', () => ({
  hasConsent: mocks.hasConsent,
}))
vi.mock('@/lib/suppression', () => ({
  isSuppressed: mocks.isSuppressed,
}))

describe('resolveSendGate — composes the live guardrails', () => {
  beforeEach(() => {
    mocks.shouldSend.mockResolvedValue(true)
    mocks.hasConsent.mockResolvedValue(true)
    mocks.isSuppressed.mockResolvedValue(false)
    mocks.getFrequency.mockResolvedValue('realtime')
    mocks.isSubjectTopicMuted.mockResolvedValue(false)
  })
  afterEach(() => vi.clearAllMocks())

  it('allows a lifecycle email when prefs + consent are on and not suppressed', async () => {
    const d = await resolveSendGate('p1', 'email', 'lifecycle', { email: 'a@b.com' })
    expect(d).toEqual({ allowed: true, reason: 'ok' })
    // lifecycle consults the lifecycle consent scope
    expect(mocks.hasConsent).toHaveBeenCalledWith('p1', 'email_lifecycle')
  })

  it('checks suppression only for the email channel with an address', async () => {
    await resolveSendGate('p1', 'inapp', 'mentions')
    expect(mocks.isSuppressed).not.toHaveBeenCalled()

    await resolveSendGate('p1', 'email', 'lifecycle', { email: 'a@b.com' })
    expect(mocks.isSuppressed).toHaveBeenCalledWith('a@b.com')
  })

  it('a suppressed address is blocked even with prefs + consent on', async () => {
    mocks.isSuppressed.mockResolvedValue(true)
    const d = await resolveSendGate('p1', 'email', 'lifecycle', { email: 'a@b.com' })
    expect(d).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it('marketing is consent-governed, not preference-governed', async () => {
    mocks.hasConsent.mockResolvedValue(false)
    const d = await resolveSendGate('p1', 'email', 'marketing', { email: 'a@b.com' })
    expect(d.reason).toBe('no_consent')
    expect(mocks.hasConsent).toHaveBeenCalledWith('p1', 'email_marketing')
    // marketing never consults the per-category preference toggle
    expect(mocks.shouldSend).not.toHaveBeenCalled()
  })

  it('community categories consult preferences and skip the consent ledger', async () => {
    await resolveSendGate('p1', 'email', 'dispatches', { email: 'a@b.com' })
    expect(mocks.shouldSend).toHaveBeenCalledWith('p1', 'email', 'dispatches')
    expect(mocks.hasConsent).not.toHaveBeenCalled()
  })

  it('enforces a passed frequency cap', async () => {
    const d = await resolveSendGate('p1', 'email', 'lifecycle', {
      email: 'a@b.com',
      frequency: { sentInWindow: 5, cap: 5 },
    })
    expect(d).toEqual({ allowed: false, reason: 'frequency_cap' })
  })

  it('fails closed when a guardrail read throws', async () => {
    mocks.hasConsent.mockRejectedValue(new Error('db down'))
    const d = await resolveSendGate('p1', 'email', 'lifecycle', { email: 'a@b.com' })
    expect(d.allowed).toBe(false)
  })

  it('transactional always sends past suppression, without reading prefs/consent', async () => {
    const d = await resolveSendGate('p1', 'email', 'transactional', { email: 'a@b.com' })
    expect(d).toEqual({ allowed: true, reason: 'ok' })
    expect(mocks.shouldSend).not.toHaveBeenCalled()
    expect(mocks.hasConsent).not.toHaveBeenCalled()
  })

  it('a suppressed address still blocks a transactional send', async () => {
    mocks.isSuppressed.mockResolvedValue(true)
    const d = await resolveSendGate('p1', 'email', 'transactional', { email: 'a@b.com' })
    expect(d).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it('defers an email realtime send when the member chose a digest for the category', async () => {
    mocks.getFrequency.mockResolvedValue('daily_digest')
    const d = await resolveSendGate('p1', 'email', 'dispatches', { email: 'a@b.com' })
    expect(d).toEqual({ allowed: false, reason: 'frequency_deferred' })
  })

  it('does not defer in-app even on a digest choice', async () => {
    mocks.getFrequency.mockResolvedValue('daily_digest')
    const d = await resolveSendGate('p1', 'inapp', 'dispatches')
    expect(d.allowed).toBe(true)
  })

  it('honours a per-subject mute when a subject is in context', async () => {
    mocks.isSubjectTopicMuted.mockResolvedValue(true)
    const d = await resolveSendGate('p1', 'email', 'dispatches', {
      email: 'a@b.com',
      subject: { subjectType: 'space', subjectId: 'space-1' },
    })
    expect(d).toEqual({ allowed: false, reason: 'subject_muted' })
    expect(mocks.isSubjectTopicMuted).toHaveBeenCalledWith(
      'p1',
      { subjectType: 'space', subjectId: 'space-1' },
      'dispatches',
      'email',
    )
  })

  it('ignores subject mutes when no subject is passed', async () => {
    await resolveSendGate('p1', 'email', 'dispatches', { email: 'a@b.com' })
    expect(mocks.isSubjectTopicMuted).not.toHaveBeenCalled()
  })
})
