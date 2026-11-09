import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/studio/campaigns', () => ({
  sendCategoryForSegment: (k: string) => (k === 'subscribed_members' ? 'marketing' : 'lifecycle'),
}))

import { sendCategoryForPurpose } from './campaign-purpose'

describe('sendCategoryForPurpose', () => {
  it('a promotional purpose is marketing even to a hand-picked set', () => {
    expect(sendCategoryForPurpose('profiles:a,b', 'marketing')).toBe('marketing')
    expect(sendCategoryForPurpose('members', 'marketing')).toBe('marketing')
  })
  it('with no purpose the audience decides, as before', () => {
    expect(sendCategoryForPurpose('members', null)).toBe('lifecycle')
    expect(sendCategoryForPurpose('subscribed_members', null)).toBe('marketing')
  })
  it('a lifecycle purpose never softens the strict marketing audience', () => {
    expect(sendCategoryForPurpose('subscribed_members', 'lifecycle')).toBe('marketing')
  })
})
