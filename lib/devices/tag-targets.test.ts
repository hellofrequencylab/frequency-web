import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { tagPathFromLink } from './tag-targets'

describe('tagPathFromLink', () => {
  it('takes a full link to one of our pages', () => {
    expect(tagPathFromLink('https://frequencylocal.com/events/full-moon-sound-bath')).toBe('/events/full-moon-sound-bath')
    expect(tagPathFromLink('www.frequencylocal.com/journeys/30-days-of-calm?x=1')).toBe('/journeys/30-days-of-calm')
  })

  it('collapses an owner page to the public page, like a printed QR', () => {
    expect(tagPathFromLink('/spaces/house-of-fates/manage')).toBe('/spaces/house-of-fates')
  })

  it('refuses other sites, admin pages and protocol tricks', () => {
    expect(tagPathFromLink('https://example.com/events/x')).toBeNull()
    expect(tagPathFromLink('/admin/cyberunicorn')).toBeNull()
    expect(tagPathFromLink('//evil.com/x')).toBeNull()
    expect(tagPathFromLink('')).toBeNull()
  })

  it('still allows the public discover page itself', () => {
    expect(tagPathFromLink('/discover')).toBe('/discover')
  })
})
