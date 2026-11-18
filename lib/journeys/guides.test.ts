import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
import { guideMayRunInSpace } from './guides'

describe('guideMayRunInSpace', () => {
  it('lets a guide run the Journey only in a Circle of its own home Space', () => {
    expect(guideMayRunInSpace({ isGuide: true, planSpaceId: 'hq', circleSpaceId: 'hq' })).toBe(true)
    expect(guideMayRunInSpace({ isGuide: true, planSpaceId: 'hq', circleSpaceId: 'other' })).toBe(false)
    expect(guideMayRunInSpace({ isGuide: true, planSpaceId: null, circleSpaceId: null })).toBe(false)
    expect(guideMayRunInSpace({ isGuide: false, planSpaceId: 'hq', circleSpaceId: 'hq' })).toBe(false)
  })
})
