import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TodayCard } from './today'

// Vera daily OWNER BRIEF (CRM Master Build Plan · Phase 7). Locks the push contract:
//   • no cards -> no brief (never a hollow email).
//   • a brief goes through resolveSendGate (consent + suppression) + the outbox, frequency-capped.
//   • a blocked gate (suppressed / no_consent / frequency_cap) sends nothing.
//   • the run is fail-safe (completes with counts even with no recipients).
// It READS + composes only; it never acts on a card (no execute path is imported here).

const buildTodayCards = vi.fn()
const resolveSendGate = vi.fn()
const enqueueEmail = vi.fn()

let queueRows: { payload: unknown }[] = []
let opsRows: unknown[] = []
let spacesRows: unknown[] = []

vi.mock('./today', () => ({ buildTodayCards: (...a: unknown[]) => buildTodayCards(...a) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: (...a: unknown[]) => resolveSendGate(...a) }))
vi.mock('@/lib/email', () => ({
  enqueueEmail: (...a: unknown[]) => enqueueEmail(...a),
  listUnsubscribeHeaders: () => ({}),
}))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsub' }))
// AI off -> the deterministic in-voice opener is used (keeps the test deterministic + exercises the fallback).
vi.mock('@/lib/ai/usage', () => ({
  aiAvailable: vi.fn().mockResolvedValue(false),
  featureOverBudget: vi.fn().mockResolvedValue(false),
  recordAiUsage: vi.fn(),
}))
vi.mock('@/lib/ai/complete', () => ({
  completeText: vi.fn(),
  AiUnavailableError: class AiUnavailableError extends Error {},
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      const rows = () => (t === 'notification_queue' ? queueRows : t === 'profiles' ? opsRows : t === 'spaces' ? spacesRows : [])
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        in: () => q,
        limit: () => Promise.resolve({ data: rows(), error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (r: { data: unknown; error: null }) => unknown) => Promise.resolve(resolve({ data: rows(), error: null })),
      }
      return q
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: null } }) } },
  }),
}))

import { buildOwnerBrief, sendOwnerBrief, runOwnerBriefs } from './owner-brief'

const card = (name: string): TodayCard => ({
  contactId: 'c',
  subjectProfileId: 'p',
  name,
  context: 'At risk',
  whyNow: `${name} has gone quiet. A warm note keeps the tie from cooling.`,
  actionDraft: 'Send a short hello and name the next circle.',
  playbookId: 'winback',
  playbookName: 'Winback',
  autonomyTier: 'suggest',
  score: 3,
  confidence: 'high',
  signals: ['about to slip away'],
})

beforeEach(() => {
  vi.clearAllMocks()
  queueRows = []
  opsRows = []
  spacesRows = []
  resolveSendGate.mockResolvedValue({ allowed: true, reason: 'ok' })
  buildTodayCards.mockResolvedValue({ cards: [card('Maya')], laterCount: 0 })
})

describe('buildOwnerBrief', () => {
  it('returns null when there is nothing to surface', async () => {
    buildTodayCards.mockResolvedValue({ cards: [], laterCount: 0 })
    expect(await buildOwnerBrief()).toBeNull()
  })

  it('composes a brief from the cards, in voice (no em dash)', async () => {
    buildTodayCards.mockResolvedValue({ cards: [card('Maya'), card('Jon')], laterCount: 3 })
    const b = await buildOwnerBrief()
    expect(b).not.toBeNull()
    expect(b!.cardCount).toBe(2)
    expect(b!.subject).toContain('2 moves')
    expect(b!.html).toContain('Maya')
    expect(b!.html).toContain('Jon')
    expect(b!.text).toContain('Later shelf')
    expect(b!.intro).not.toContain('—')
    expect(b!.subject).not.toContain('—')
  })

  it('passes the scope through to buildTodayCards', async () => {
    await buildOwnerBrief({ spaceId: 'space-1' })
    expect(buildTodayCards).toHaveBeenCalledWith({ spaceId: 'space-1' })
  })
})

describe('sendOwnerBrief', () => {
  it('sends a tagged, gated brief through the outbox when allowed', async () => {
    const r = await sendOwnerBrief({ profileId: 'op', email: 'op@x.com' })
    expect(r.sent).toBe(true)
    expect(enqueueEmail).toHaveBeenCalledOnce()
    const payload = enqueueEmail.mock.calls[0][0] as { to: string; tags: { name: string }[] }
    expect(payload.to).toBe('op@x.com')
    expect(payload.tags[0].name).toBe('vera_owner_brief')
  })

  it('sends nothing when the gate blocks (suppressed / unconsented)', async () => {
    resolveSendGate.mockResolvedValue({ allowed: false, reason: 'suppressed' })
    const r = await sendOwnerBrief({ profileId: 'op', email: 'op@x.com' })
    expect(r.sent).toBe(false)
    expect(r.reason).toBe('suppressed')
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('sends nothing when there are no moves to surface', async () => {
    buildTodayCards.mockResolvedValue({ cards: [], laterCount: 0 })
    const r = await sendOwnerBrief({ profileId: 'op', email: 'op@x.com' })
    expect(r.sent).toBe(false)
    expect(r.reason).toBe('nothing_to_surface')
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('skips a recipient with no email', async () => {
    const r = await sendOwnerBrief({ profileId: 'op', email: '' })
    expect(r.reason).toBe('no_email')
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('feeds the per-day frequency window to the gate (double-fire guard)', async () => {
    queueRows = [{ payload: { to: 'op@x.com', tags: [{ name: 'vera_owner_brief' }] } }]
    resolveSendGate.mockResolvedValue({ allowed: false, reason: 'frequency_cap' })
    await sendOwnerBrief({ profileId: 'op', email: 'op@x.com' })
    const freq = (resolveSendGate.mock.calls[0][3] as { frequency: unknown }).frequency
    expect(freq).toEqual({ sentInWindow: 1, cap: 1 })
  })
})

describe('runOwnerBriefs', () => {
  it('completes fail-safe with counts when there are no recipients', async () => {
    const res = await runOwnerBriefs()
    expect(res).toEqual({ candidates: 0, sent: 0, skipped: 0, errors: 0 })
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})
