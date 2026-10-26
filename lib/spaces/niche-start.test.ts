import { describe, it, expect, vi, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({ bundle: vi.fn() }))
vi.mock('@/lib/pricing/space-bundle', () => ({ setSpaceBundle: H.bundle }))

import { startSpaceFromNiche } from './niche-start'

beforeEach(() => H.bundle.mockReset())

describe('startSpaceFromNiche (ADR-1882)', () => {
  it('applies the niche preset through the one bundle writer', async () => {
    H.bundle.mockResolvedValue({ ok: true })
    expect(await startSpaceFromNiche('s1', 'nonprofits')).toBe(true)
    expect(H.bundle).toHaveBeenCalledWith('s1', 'nonprofit')
  })
  it('does nothing for a niche with no preset or an unknown one', async () => {
    expect(await startSpaceFromNiche('s1', 'networks')).toBe(false)
    expect(await startSpaceFromNiche('s1', 'bogus')).toBe(false)
    expect(await startSpaceFromNiche('s1', null)).toBe(false)
    expect(H.bundle).not.toHaveBeenCalled()
  })
  it('reports a refused write as not applied', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    H.bundle.mockResolvedValue({ ok: false, reason: 'error' })
    expect(await startSpaceFromNiche('s1', 'studios')).toBe(false)
  })
})
