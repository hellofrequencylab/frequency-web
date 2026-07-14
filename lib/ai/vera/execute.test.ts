import { describe, it, expect, beforeEach, vi } from 'vitest'

// Send-graduation harness (CRM Master Build Plan · Phase 7, ADR-028 spine/consent/suppression).
// Locks the non-autonomous contract for the two OUTBOUND email tools:
//   • unconfirmed (no approvedSend) -> DRAFT only, never a real send.
//   • confirmed (approvedSend: true) + gate allows -> a real, gated send through the outbox.
//   • suppressed / unconsented recipient -> NEVER sent, in either mode.
//   • an intro never sends unless BOTH parties opted in, even with approval.
// The dependency seams are mocked so the branching (draft vs send) is observed directly; the real
// validateToolCall (pure) still runs, so a malformed call is still rejected.

const enqueueEmail = vi.fn()
const recordContactInteraction = vi.fn()
const resolveSendGate = vi.fn()
const bothPartiesOptedIn = vi.fn()

let contactEmailValue: string | null = 'member@example.com'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: () => Promise.resolve({ data: { email: contactEmailValue }, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/ai/memory', () => ({ rememberFacts: vi.fn() }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(), recordStreakActivity: vi.fn() }))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn() }))
vi.mock('@/lib/crm/interactions', () => ({
  recordContactInteraction: (...a: unknown[]) => recordContactInteraction(...a),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: (...a: unknown[]) => resolveSendGate(...a) }))
vi.mock('@/lib/practice-streak', () => ({ saveStreakWithFreeze: vi.fn() }))
vi.mock('@/lib/resonance/matches', () => ({ bothPartiesOptedIn: (...a: unknown[]) => bothPartiesOptedIn(...a) }))
vi.mock('@/lib/email', () => ({
  enqueueEmail: (...a: unknown[]) => enqueueEmail(...a),
  listUnsubscribeHeaders: () => ({}),
}))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsub' }))

import { executeConfirmedTool } from './execute'

const SUBJECT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const CONTACT = '33333333-3333-3333-3333-333333333333'

const playbookArgs = {
  subjectProfileId: SUBJECT,
  contactId: CONTACT,
  category: 'lifecycle',
  subject: 'A quick hello',
  body: 'We miss you at the circle. Come by Thursday.',
}
const introArgs = {
  subjectProfileId: SUBJECT,
  otherProfileId: OTHER,
  contactId: CONTACT,
  subject: 'Two people to meet',
  body: 'You both love climbing. Say hi when you have a minute.',
}

const lastTouchStatus = () =>
  (recordContactInteraction.mock.calls[0][0] as { metadata: { status: string } }).metadata.status

beforeEach(() => {
  vi.clearAllMocks()
  contactEmailValue = 'member@example.com'
  resolveSendGate.mockResolvedValue({ allowed: true, reason: 'ok' })
  bothPartiesOptedIn.mockResolvedValue(true)
})

describe('send_playbook_email graduation', () => {
  it('drafts only without approval (never a real send)', async () => {
    const res = await executeConfirmedTool('op', 'send_playbook_email', { ...playbookArgs })
    expect(res.ok).toBe(true)
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(recordContactInteraction).toHaveBeenCalledOnce()
    expect(lastTouchStatus()).toBe('drafted')
  })

  it('really sends on explicit approval when the gate allows', async () => {
    const res = await executeConfirmedTool('op', 'send_playbook_email', { ...playbookArgs }, { approvedSend: true })
    expect(res.ok).toBe(true)
    expect(enqueueEmail).toHaveBeenCalledOnce()
    expect((enqueueEmail.mock.calls[0][0] as { to: string }).to).toBe('member@example.com')
    expect(lastTouchStatus()).toBe('sent')
  })

  it('never sends to a suppressed or unconsented recipient, even with approval', async () => {
    resolveSendGate.mockResolvedValue({ allowed: false, reason: 'suppressed' })
    const res = await executeConfirmedTool('op', 'send_playbook_email', { ...playbookArgs }, { approvedSend: true })
    expect(res.ok).toBe(false)
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(recordContactInteraction).not.toHaveBeenCalled()
  })

  it('stays a draft when approved but no deliverable address exists (fail-closed)', async () => {
    contactEmailValue = null
    const res = await executeConfirmedTool('op', 'send_playbook_email', { ...playbookArgs }, { approvedSend: true })
    expect(res.ok).toBe(true)
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(lastTouchStatus()).toBe('drafted')
  })
})

describe('send_intro_email graduation', () => {
  it('drafts only without approval', async () => {
    const res = await executeConfirmedTool('op', 'send_intro_email', { ...introArgs })
    expect(res.ok).toBe(true)
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(lastTouchStatus()).toBe('drafted')
  })

  it('never sends unless both parties opted in, even with approval', async () => {
    bothPartiesOptedIn.mockResolvedValue(false)
    const res = await executeConfirmedTool('op', 'send_intro_email', { ...introArgs }, { approvedSend: true })
    expect(res.ok).toBe(false)
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(recordContactInteraction).not.toHaveBeenCalled()
  })

  it('sends on approval when both opted in and the gate allows', async () => {
    const res = await executeConfirmedTool('op', 'send_intro_email', { ...introArgs }, { approvedSend: true })
    expect(res.ok).toBe(true)
    expect(enqueueEmail).toHaveBeenCalledOnce()
    expect(lastTouchStatus()).toBe('sent')
  })

  it('never sends when the recipient has not consented, even with both opted in + approval', async () => {
    resolveSendGate.mockResolvedValue({ allowed: false, reason: 'no_consent' })
    const res = await executeConfirmedTool('op', 'send_intro_email', { ...introArgs }, { approvedSend: true })
    expect(res.ok).toBe(false)
    expect(enqueueEmail).not.toHaveBeenCalled()
  })
})
