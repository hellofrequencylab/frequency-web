import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { isSpotlightClickTarget } from './spotlight-clicks'

describe('isSpotlightClickTarget (LIVE-856)', () => {
  it('takes the Link cards target ids', () => {
    for (const t of ['book', 'contact', 'product:abc-1', 'journey:x_y', 'event:9', 'membership:m1']) expect(isSpotlightClickTarget(t), t).toBe(true)
  })

  it('refuses anything else', () => {
    for (const t of ['', 'links', 'product:', 'product:a b', 'other:1', 'book ', 42, null]) expect(isSpotlightClickTarget(t), String(t)).toBe(false)
  })
})
