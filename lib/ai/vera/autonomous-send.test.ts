import { describe, it, expect, vi } from 'vitest'

// The inline unsubscribe/header helpers run on the success path; stub them so the test exercises the
// gate logic, not URL/crypto plumbing. All the real IO (breaker / send-gate / enqueue / propose /
// audit) is injected via `deps`.
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsub' }))
vi.mock('@/lib/email', () => ({ enqueueEmail: vi.fn(), listUnsubscribeHeaders: () => ({}) }))

import { autonomousSend, type AutonomousSendInput, type AutonomousSendDeps } from './autonomous-send'

// The graduation path. The load-bearing invariants:
//   • BOTH gates are unbypassable: the enqueue happens ONLY when the breaker AND the send-gate allow.
//   • A block by EITHER gate falls back to propose (human approval) and NEVER sends.
//   • Fail-closed: an unexpected error proposes, never sends.

const input: AutonomousSendInput = {
  category: 'playbook_email',
  recipientProfileId: '11111111-1111-1111-1111-111111111111',
  recipientEmail: 'member@example.com',
  sendCategory: 'lifecycle',
  subject: 'A small nudge',
  body: 'Hey, we saved your streak.',
  rationale: 'Lapsed 10 days; winback playbook.',
}

function makeDeps(over: Partial<AutonomousSendDeps> = {}): AutonomousSendDeps {
  return {
    checkBreaker: vi.fn().mockResolvedValue({ allowed: true, reason: 'ok', trips: false }),
    runSendGate: vi.fn().mockResolvedValue({ allowed: true, reason: 'ok' }),
    enqueue: vi.fn().mockResolvedValue(undefined),
    propose: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('autonomousSend — both gates clear', () => {
  it('enqueues exactly once and audits as sent', async () => {
    const deps = makeDeps()
    const res = await autonomousSend(input, deps)
    expect(res).toEqual({ status: 'sent' })
    expect(deps.enqueue).toHaveBeenCalledTimes(1)
    // The autonomous send is tagged so the rate-cap counter can see it.
    const payload = (deps.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.tags).toEqual([{ name: 'vera_autonomous', value: 'playbook_email' }])
    expect(payload.to).toBe('member@example.com')
    expect(deps.propose).not.toHaveBeenCalled()
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'sent' }))
  })
})

describe('autonomousSend — the breaker is unbypassable', () => {
  it('a breaker block never calls the send-gate or enqueue; it proposes', async () => {
    const deps = makeDeps({
      checkBreaker: vi.fn().mockResolvedValue({ allowed: false, reason: 'recipient_cap', trips: false }),
    })
    const res = await autonomousSend(input, deps)
    expect(res).toEqual({ status: 'proposed', reason: 'breaker:recipient_cap' })
    expect(deps.runSendGate).not.toHaveBeenCalled()
    expect(deps.enqueue).not.toHaveBeenCalled()
    expect(deps.propose).toHaveBeenCalledTimes(1)
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'proposed', breakerReason: 'recipient_cap' }))
  })

  it('a tripped/killed breaker (autonomy_off) proposes, never sends', async () => {
    const deps = makeDeps({
      checkBreaker: vi.fn().mockResolvedValue({ allowed: false, reason: 'autonomy_off', trips: false }),
    })
    const res = await autonomousSend(input, deps)
    expect(res.status).toBe('proposed')
    expect(deps.enqueue).not.toHaveBeenCalled()
  })
})

describe('autonomousSend — the send-gate is unbypassable', () => {
  it('breaker clear but gate blocks (suppressed) → no enqueue, proposes', async () => {
    const deps = makeDeps({
      runSendGate: vi.fn().mockResolvedValue({ allowed: false, reason: 'suppressed' }),
    })
    const res = await autonomousSend(input, deps)
    expect(res).toEqual({ status: 'proposed', reason: 'gate:suppressed' })
    expect(deps.enqueue).not.toHaveBeenCalled()
    expect(deps.propose).toHaveBeenCalledTimes(1)
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'proposed', gateReason: 'suppressed' }))
  })

  it('no consent → proposes, never sends', async () => {
    const deps = makeDeps({
      runSendGate: vi.fn().mockResolvedValue({ allowed: false, reason: 'no_consent' }),
    })
    const res = await autonomousSend(input, deps)
    expect(res).toEqual({ status: 'proposed', reason: 'gate:no_consent' })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })
})

describe('autonomousSend — missing address', () => {
  it('both gates clear but no deliverable email → proposes (cannot really send)', async () => {
    const deps = makeDeps()
    const res = await autonomousSend({ ...input, recipientEmail: null }, deps)
    expect(res).toEqual({ status: 'proposed', reason: 'no_email' })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })
})

describe('autonomousSend — fail-closed', () => {
  it('an unexpected error proposes, never sends', async () => {
    const deps = makeDeps({
      checkBreaker: vi.fn().mockRejectedValue(new Error('boom')),
    })
    const res = await autonomousSend(input, deps)
    expect(res).toEqual({ status: 'proposed', reason: 'error' })
    expect(deps.enqueue).not.toHaveBeenCalled()
    expect(deps.propose).toHaveBeenCalledTimes(1)
  })

  it('if even the propose write fails, it reports blocked but STILL never sends', async () => {
    const deps = makeDeps({
      checkBreaker: vi.fn().mockResolvedValue({ allowed: false, reason: 'platform_cap', trips: false }),
      propose: vi.fn().mockRejectedValue(new Error('db down')),
    })
    const res = await autonomousSend(input, deps)
    expect(res).toEqual({ status: 'blocked', reason: 'breaker:platform_cap' })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })
})
