import { describe, expect, it, vi } from 'vitest'

// The builder's kit list follows the one hidden flag (RETIRED_FROM_PICKERS through SITE_THEMES): the moment New World
// and Services are offered to the pickers, the builder leads with New World and a cold visit starts on it.
vi.mock('@/lib/theme/site-style', () => ({
  SITE_THEMES: ['new-world', 'services', 'designer', 'midnight', 'network-kit', 'temple-kit', 'bold', 'wildheart', 'frequency'].map((id) => ({ id })),
}))

describe('preview kit gate', () => {
  it('leads with New World and Services once the pickers offer them, and the cold kit becomes New World', async () => {
    const { PREVIEW_KIT_ORDER } = await import('@/lib/theme/preview-tokens')
    expect(PREVIEW_KIT_ORDER.slice(0, 2)).toEqual(['new-world', 'services'])
    const { COLD_KIT } = await import('@/lib/create-space/door')
    expect(COLD_KIT).toBe('new-world')
  })
})
