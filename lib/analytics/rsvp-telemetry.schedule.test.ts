import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2307, point 5. The confirmed-RSVP telemetry (the event.rsvp ledger row and the experiment
// outcome behind it) was a floating promise from the RSVP action. Nothing held the invocation open
// and the outcome path reads request cookies, so the outcome could be lost once the response went.
// It is now registered with after(), which the platform awaits inside the request.

vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  identity: vi.fn(),
  track: vi.fn(),
  outcomes: vi.fn(),
}))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('./ga-client-id', () => ({ readGaIdentity: mocks.identity }))
vi.mock('./track', () => ({ track: mocks.track }))
vi.mock('./experiment-runtime', () => ({ recordExperimentOutcomes: mocks.outcomes }))
import { scheduleConfirmedRsvp } from './rsvp-telemetry'

describe('LIVE-2307: the RSVP outcome is awaited within the request', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.identity.mockResolvedValue(null)
    mocks.track.mockResolvedValue(true)
  })

  it('hands the work to after() instead of starting a floating promise', () => {
    scheduleConfirmedRsvp('event', 'member')
    expect(mocks.after).toHaveBeenCalledTimes(1)
    // Nothing ran on its own: the platform owns the callback and its lifetime.
    expect(mocks.track).not.toHaveBeenCalled()
    expect(mocks.outcomes).not.toHaveBeenCalled()
  })

  it('the promise after() awaits settles only once the experiment outcome has been written', async () => {
    let finishOutcome: () => void = () => {}
    mocks.outcomes.mockReturnValue(new Promise<void>((resolve) => { finishOutcome = resolve }))
    scheduleConfirmedRsvp('event', 'member')
    const callback = mocks.after.mock.calls[0]?.[0] as () => Promise<void>

    let settled = false
    const held = callback().then(() => { settled = true })
    await vi.waitFor(() => expect(mocks.outcomes).toHaveBeenCalledWith('event.rsvp', 'member'))
    expect(settled).toBe(false)

    finishOutcome()
    await held
    expect(settled).toBe(true)
    expect(mocks.track).toHaveBeenCalledWith('event.rsvp', { eventId: 'event' }, 'member', {
      idempotencyKey: 'event.rsvp:event:member', gaIdentity: null,
    })
  })

  it('never breaks the saved RSVP when there is no request scope, and still records best effort', async () => {
    mocks.after.mockImplementation(() => { throw new Error('`after` was called outside a request scope.') })
    mocks.outcomes.mockResolvedValue(undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => scheduleConfirmedRsvp('event', 'member')).not.toThrow()
    await vi.waitFor(() => expect(mocks.outcomes).toHaveBeenCalledWith('event.rsvp', 'member'))
    // The fail-safe is not silent: the log line is how a scope-less caller gets noticed.
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('the RSVP action no longer fires the telemetry un-awaited', () => {
    const src = readFileSync('app/(main)/events/actions.ts', 'utf8')
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/recordConfirmedRsvp/)
    expect(code).toMatch(/scheduleConfirmedRsvp\(eventId, profileId\)/)
  })
})
