import { describe, expect, it, vi, beforeEach } from 'vitest'

// LIVE-1864: a theme change expires that one Space's cached site and nothing else.

const revalidatePath = vi.fn()
const updateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  updateTag: (...a: unknown[]) => updateTag(...a),
  revalidateTag: vi.fn(),
  unstable_cache: undefined,
}))
vi.mock('@/lib/spaces/store', () => ({ getPublicSpaceBySlugOrThrow: vi.fn(), getSpaceHostRow: vi.fn() }))

const { revalidateThemeChange } = await import('./theme-revalidate')
const { siteCacheTag } = await import('@/lib/cross-request-cache')

beforeEach(() => {
  revalidatePath.mockReset()
  updateTag.mockReset()
})

describe('revalidateThemeChange', () => {
  it("expires only the Space's own site tag and its /sites tree", () => {
    revalidateThemeChange('Garden-Circle')
    expect(updateTag).toHaveBeenCalledTimes(1)
    expect(updateTag).toHaveBeenCalledWith(siteCacheTag('Garden-Circle'))
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/sites/garden-circle', 'layout')
  })

  it('never touches the root or another Space', () => {
    revalidateThemeChange('one')
    const paths = revalidatePath.mock.calls.map((c) => String(c[0]))
    expect(paths).not.toContain('/')
    expect(paths.every((p) => p.startsWith('/sites/one'))).toBe(true)
  })
})
