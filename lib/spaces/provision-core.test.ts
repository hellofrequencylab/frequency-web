import { describe, it, expect, vi, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({ bundle: vi.fn(), stages: vi.fn() }))

vi.mock('@/lib/spaces/type-defaults', () => ({ listTypeDefaultsForType: async () => [] }))
vi.mock('@/lib/pricing/space-bundle', () => ({ setSpaceBundle: H.bundle }))
vi.mock('@/lib/crm/pipeline', () => ({ ensureSpaceStages: H.stages }))

import { spaceBirthConfig, finishSpaceBirth } from './provision-core'

beforeEach(() => {
  H.bundle.mockReset()
  H.stages.mockReset()
})

describe('spaceBirthConfig', () => {
  it('drops an unknown Focus to null and never throws', async () => {
    const c = await spaceBirthConfig('business', { modeVariant: 'not-a-focus' })
    expect(c.modeVariant).toBeNull()
    expect(c.entitlements).toEqual({})
  })
  it('ignores an unregistered preset id', async () => {
    const c = await spaceBirthConfig('business', { preset: 'nope' })
    expect(c.presetId === null || typeof c.presetId === 'string').toBe(true)
  })
})

describe('finishSpaceBirth', () => {
  it('applies the preset and seeds stages', async () => {
    H.bundle.mockResolvedValue({ ok: true })
    await finishSpaceBirth('s1', 'business', { modeVariant: null, presetId: 'p1' })
    expect(H.bundle).toHaveBeenCalledWith('s1', 'p1')
    expect(H.stages).toHaveBeenCalledWith('s1', 'business', null)
  })
  it('survives a bundle that throws', async () => {
    H.bundle.mockRejectedValue(new Error('x'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(finishSpaceBirth('s1', 'business', { modeVariant: null, presetId: 'p1' })).resolves.toBeUndefined()
    expect(H.stages).toHaveBeenCalled()
  })
  it('skips the preset when none', async () => {
    await finishSpaceBirth('s1', 'business', { modeVariant: null, presetId: null })
    expect(H.bundle).not.toHaveBeenCalled()
  })
})
