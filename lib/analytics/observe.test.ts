// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The visit id that stitches a tab's interactions together (HYG-143). It is random, and the
// randomness comes from Web Crypto on every path: randomUUID where the context is secure,
// getRandomValues where it is not (an http preview). Math.random is never the source.

describe('getSessionId', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses randomUUID when the context offers it, and keeps the id for the tab', async () => {
    const { getSessionId } = await import('./observe')
    const id = getSessionId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(getSessionId()).toBe(id)
    expect(sessionStorage.getItem('fq_obs_sid')).toBe(id)
  })

  it('falls back to getRandomValues, not Math.random, when randomUUID is missing', async () => {
    const random = vi.spyOn(Math, 'random')
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) })
    const { getSessionId } = await import('./observe')
    const id = getSessionId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(random).not.toHaveBeenCalled()
  })

  it('still answers when sessionStorage throws', async () => {
    const random = vi.spyOn(Math, 'random')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { getSessionId } = await import('./observe')
    expect(getSessionId()).toMatch(/^[0-9a-f-]{32,36}$/)
    expect(random).not.toHaveBeenCalled()
  })
})
