import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/pricing/space-allowance', () => ({ spaceLimitsWaived: vi.fn(async () => false) }))

import type { Space } from '@/lib/spaces/types'
import { loyaltyEligibility, spaceHasPin } from './store'

const base = { id: 's1', plan: 'business', latitude: null, longitude: null, street: null, city: 'Carlsbad' } as unknown as Space

describe('Regulars eligibility', () => {
  it('does not need a map pin', async () => {
    expect(spaceHasPin(base)).toBe(false)
    expect(await loyaltyEligibility(base)).toBeNull()
  })
  it('still needs a Business plan', async () => {
    expect(await loyaltyEligibility({ ...base, plan: 'free' } as unknown as Space)).toBe('plan')
  })
  it('sees a pin when coordinates exist', () => {
    expect(spaceHasPin({ ...base, latitude: 33.1, longitude: -117.3 } as unknown as Space)).toBe(true)
  })
})
