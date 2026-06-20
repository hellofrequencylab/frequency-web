import { describe, it, expect, vi, beforeEach } from 'vitest'

// ENTITY-PROFILE TELEMETRY (the first signal on /spaces profiles). What is locked here — all
// network-free (the engagement ledger is mocked):
//   1. A profile VIEW records the named `space.profile_view` event into the EXISTING engagement
//      ledger, on the `web` source, carrying the viewer as actor and the space_id in `context`.
//   2. The view idempotency key buckets per (space, viewer, UTC day) — a reload the same day is
//      one bucket; an anonymous viewer collapses to a single daily bucket per space.
//   3. A CTA CLICK records the named `space.cta_click` event; each click is its own row (no
//      idempotency collapse), tagged with the space_id.
//   4. FAIL-SAFE: a throwing ledger never throws out of either recorder (telemetry can't break a
//      render), and an empty spaceId is a guarded no-op (nothing is written).

type LedgerInput = {
  idempotencyKey: string
  source: string
  eventType: string
  actorProfileId: string | null
  context: Record<string, unknown>
}

// ── Mock the existing engagement ledger (the backbone we reuse) ─────────────────────────────────
const recordEngagementEvent = vi.fn((input: LedgerInput) => {
  void input
  return Promise.resolve({ recorded: true })
})
vi.mock('@/lib/engagement/events', () => ({
  recordEngagementEvent: (input: LedgerInput) => recordEngagementEvent(input),
}))

import { recordSpaceProfileView, recordSpaceCtaClick } from './analytics'

const lastCall = (): LedgerInput => {
  const calls = recordEngagementEvent.mock.calls
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  recordEngagementEvent.mockClear()
  recordEngagementEvent.mockImplementation(async () => ({ recorded: true }))
})

describe('recordSpaceProfileView', () => {
  it('records the named view event on the web source, tagged with space_id + actor', async () => {
    await recordSpaceProfileView('space-1', 'viewer-1')
    expect(recordEngagementEvent).toHaveBeenCalledTimes(1)
    const arg = lastCall()
    expect(arg.eventType).toBe('space.profile_view')
    expect(arg.source).toBe('web')
    expect(arg.actorProfileId).toBe('viewer-1')
    expect(arg.context).toEqual({ spaceId: 'space-1' })
  })

  it('buckets the idempotency key per (space, viewer, UTC day)', async () => {
    const day = new Date().toISOString().slice(0, 10)
    await recordSpaceProfileView('space-1', 'viewer-1')
    expect(lastCall().idempotencyKey).toBe(`space_view:space-1:viewer-1:${day}`)
  })

  it('collapses an anonymous viewer to a single daily bucket per space', async () => {
    const day = new Date().toISOString().slice(0, 10)
    await recordSpaceProfileView('space-1') // no viewer id
    const arg = lastCall()
    expect(arg.actorProfileId).toBeNull()
    expect(arg.idempotencyKey).toBe(`space_view:space-1:anon:${day}`)
  })

  it('is a guarded no-op when spaceId is empty (nothing written)', async () => {
    await recordSpaceProfileView('', 'viewer-1')
    expect(recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('never throws when the ledger throws (telemetry is best-effort)', async () => {
    recordEngagementEvent.mockImplementationOnce(async () => {
      throw new Error('ledger down')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordSpaceProfileView('space-1', 'viewer-1')).resolves.toBeUndefined()
    errSpy.mockRestore()
  })
})

describe('recordSpaceCtaClick', () => {
  it('records the named CTA event tagged with space_id + actor', async () => {
    await recordSpaceCtaClick('space-1', 'viewer-1')
    const arg = lastCall()
    expect(arg.eventType).toBe('space.cta_click')
    expect(arg.source).toBe('web')
    expect(arg.actorProfileId).toBe('viewer-1')
    expect(arg.context).toEqual({ spaceId: 'space-1' })
  })

  it('gives each click its own row (distinct idempotency keys, no collapse)', async () => {
    await recordSpaceCtaClick('space-1', 'viewer-1')
    const first = lastCall().idempotencyKey
    await recordSpaceCtaClick('space-1', 'viewer-1')
    const second = lastCall().idempotencyKey
    expect(first).not.toBe(second)
    expect(first.startsWith('space_cta:space-1:viewer-1:')).toBe(true)
  })

  it('is a guarded no-op when spaceId is empty', async () => {
    await recordSpaceCtaClick('')
    expect(recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('never throws when the ledger throws', async () => {
    recordEngagementEvent.mockImplementationOnce(async () => {
      throw new Error('ledger down')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordSpaceCtaClick('space-1')).resolves.toBeUndefined()
    errSpy.mockRestore()
  })
})
