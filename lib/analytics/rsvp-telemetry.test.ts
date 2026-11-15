import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ identity: vi.fn(), track: vi.fn(), outcomes: vi.fn() }))
vi.mock('./ga-client-id', () => ({ readGaIdentity: mocks.identity }))
vi.mock('./track', () => ({ track: mocks.track }))
vi.mock('./experiment-runtime', () => ({ recordExperimentOutcomes: mocks.outcomes }))
import { recordConfirmedRsvp } from './rsvp-telemetry'

describe('confirmed RSVP telemetry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.identity.mockResolvedValue({ clientId: '123.456', sessionId: '12345678' })
    mocks.track.mockResolvedValue(true)
    mocks.outcomes.mockResolvedValue(undefined)
  })
  it('joins the trusted browser session and preserves authoritative deduplication', async () => {
    await recordConfirmedRsvp('event', 'member')
    expect(mocks.track).toHaveBeenCalledWith('event.rsvp', { eventId: 'event' }, 'member', {
      idempotencyKey: 'event.rsvp:event:member', gaIdentity: { clientId: '123.456', sessionId: '12345678' },
    })
    expect(mocks.outcomes).toHaveBeenCalledWith('event.rsvp', 'member')
  })
  it('keeps the first-party conversion when cookies or consent are absent', async () => {
    mocks.identity.mockResolvedValue(null)
    await recordConfirmedRsvp('event', 'member')
    expect(mocks.track).toHaveBeenCalledWith('event.rsvp', { eventId: 'event' }, 'member', {
      idempotencyKey: 'event.rsvp:event:member', gaIdentity: null,
    })
  })
  it('still records the first-party conversion if identity resolution fails', async () => {
    mocks.identity.mockRejectedValue(new Error('cookie context unavailable'))
    await recordConfirmedRsvp('event', 'member')
    expect(mocks.track).toHaveBeenCalledWith('event.rsvp', { eventId: 'event' }, 'member', expect.objectContaining({ gaIdentity: null }))
  })
  it('does not count a duplicate or rejected ledger write as an experiment outcome', async () => {
    mocks.track.mockResolvedValue(false)
    await recordConfirmedRsvp('event', 'member')
    expect(mocks.outcomes).not.toHaveBeenCalled()
  })
  it('never propagates ledger or experiment errors into the successful RSVP', async () => {
    mocks.track.mockRejectedValueOnce(new Error('ledger unavailable'))
    await expect(recordConfirmedRsvp('event', 'member')).resolves.toBeUndefined()
    expect(mocks.outcomes).not.toHaveBeenCalled()
    mocks.track.mockResolvedValueOnce(true)
    mocks.outcomes.mockRejectedValueOnce(new Error('experiment unavailable'))
    await expect(recordConfirmedRsvp('event', 'member')).resolves.toBeUndefined()
  })
})
