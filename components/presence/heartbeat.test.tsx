// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// ── LIVE-649 (ADR-1617): the heartbeat is the clock for the whole prefetch fan-out ────────────────
//
// Every ping is a Server Action, and on 2026-09-29 each one made the client drop its prefetch cache and
// prefetch every visible Link again. So the heartbeat must not tick faster than MIN_GAP_MS however
// it is asked: a remount, a flapping visibility, or a ping that keeps failing on a stale tab.

const pingPresence = vi.fn(async () => {})
vi.mock('./actions', () => ({ pingPresence: () => pingPresence() }))

const { PresenceHeartbeat, MIN_GAP_MS, MAX_BACKOFF_MS, mayPing, resetPresenceGateForTests } = await import('./heartbeat')

let container: HTMLDivElement
let root: Root | null = null

function mount() {
  root = createRoot(container)
  act(() => root!.render(<PresenceHeartbeat />))
}
function unmount() {
  act(() => root?.unmount())
  root = null
}
async function flush() {
  await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-29T14:00:00Z'))
  resetPresenceGateForTests()
  pingPresence.mockReset()
  pingPresence.mockImplementation(async () => {})
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  unmount()
  container.remove()
  vi.useRealTimers()
})

describe('🔴 the presence heartbeat cannot become a loop (LIVE-649)', () => {
  it('a remount on every refresh pings once, not once per mount', async () => {
    for (let i = 0; i < 20; i++) {
      mount()
      await flush()
      unmount()
      vi.advanceTimersByTime(700) // the ~0.7 s round trip of the 2026-09-29 cycle
    }
    expect(pingPresence).toHaveBeenCalledTimes(1)
  })

  it('a visibility flap pings once', async () => {
    mount()
    await flush()
    for (let i = 0; i < 20; i++) {
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
      vi.advanceTimersByTime(1_000)
    }
    expect(pingPresence).toHaveBeenCalledTimes(1)
  })

  it('still beats every 90 s while visible', async () => {
    mount()
    await flush()
    await act(async () => { vi.advanceTimersByTime(90_000) })
    await act(async () => { vi.advanceTimersByTime(90_000) })
    expect(pingPresence).toHaveBeenCalledTimes(3)
  })

  it('a failing ping backs off instead of failing on schedule forever', async () => {
    pingPresence.mockImplementation(async () => { throw new Error('Failed to find Server Action') })
    mount()
    await flush()
    // One hour of a stale tab: on schedule that is 41 attempts.
    for (let i = 0; i < 40; i++) await act(async () => { vi.advanceTimersByTime(90_000) })
    expect(pingPresence.mock.calls.length).toBeLessThanOrEqual(6)
  })

  it('the gate: MIN_GAP_MS between pings, backoff capped at MAX_BACKOFF_MS', () => {
    expect(mayPing(MIN_GAP_MS - 1, 0, 0)).toBe(false)
    expect(mayPing(MIN_GAP_MS, 0, 0)).toBe(true)
    expect(mayPing(179_999, 0, 1)).toBe(false)
    expect(mayPing(MAX_BACKOFF_MS, 0, 30)).toBe(true)
  })
})
