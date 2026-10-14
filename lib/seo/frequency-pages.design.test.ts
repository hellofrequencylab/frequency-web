import { describe, it, expect, vi } from 'vitest'
import { FREQUENCY_PAGE_SEO, frequencyPageMetadata } from './frequency-pages'

// UNDER FREQUENCY, the routes whose body is a coded design page publish that page's metadata.

vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

describe('Frequency metadata follows the Frequency body', () => {
  it('/spaces', async () => {
    const { metadata } = await import('@/app/(marketing)/spaces/page')
    expect(metadata).toEqual(frequencyPageMetadata(FREQUENCY_PAGE_SEO.spaces))
  })

  it('/the-community', async () => {
    const { metadata } = await import('@/app/(marketing)/the-community/page')
    expect(metadata).toEqual(frequencyPageMetadata(FREQUENCY_PAGE_SEO.community))
  })
})
