import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPlatformSetting = vi.fn()
const setPlatformSetting = vi.fn()
vi.mock('@/lib/platform-flags', () => ({
  getPlatformSetting: (...a: unknown[]) => getPlatformSetting(...a),
  setPlatformSetting: (...a: unknown[]) => setPlatformSetting(...a),
}))

// LIVE-658: the community default generation is editable data, with the code default underneath.
import {
  DEFAULT_GENERATION_KEY,
  coerceStoredGeneration,
  communityDefaultGeneration,
  setCommunityDefaultGeneration,
} from './default-generation'

beforeEach(() => {
  getPlatformSetting.mockReset()
  setPlatformSetting.mockReset()
})

describe('coerceStoredGeneration', () => {
  it('keeps a registered id and drops anything else', () => {
    expect(coerceStoredGeneration('spacious')).toBe('spacious')
    expect(coerceStoredGeneration(' kids-mid ')).toBe('kids-mid')
    expect(coerceStoredGeneration('neon')).toBeNull()
    expect(coerceStoredGeneration('')).toBeNull()
    expect(coerceStoredGeneration(null)).toBeNull()
  })
})

describe('communityDefaultGeneration', () => {
  it('reads the stored id', async () => {
    getPlatformSetting.mockResolvedValue('bold')
    expect(await communityDefaultGeneration()).toBe('bold')
    expect(getPlatformSetting).toHaveBeenCalledWith(DEFAULT_GENERATION_KEY, '')
  })

  it('falls back to the code default on an absent or unknown row', async () => {
    getPlatformSetting.mockResolvedValue('not-a-feel')
    expect(await communityDefaultGeneration()).toBe('balanced')
  })
})

describe('setCommunityDefaultGeneration', () => {
  it('stores a registered id and returns what landed', async () => {
    expect(await setCommunityDefaultGeneration('playful', 'p1')).toBe('playful')
    expect(setPlatformSetting).toHaveBeenCalledWith(DEFAULT_GENERATION_KEY, 'playful', 'p1')
  })

  it('never stores an unknown id', async () => {
    expect(await setCommunityDefaultGeneration('<script>')).toBe('balanced')
    expect(setPlatformSetting).toHaveBeenCalledWith(DEFAULT_GENERATION_KEY, 'balanced', null)
  })
})
