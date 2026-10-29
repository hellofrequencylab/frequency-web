import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const ask = { id: 'a1', fundLabel: 'Keep the studio open', description: 'Rent and tea.', suggestedAmountsCents: [1000, 2500], isActive: true }
const state = { ask: ask as typeof ask | null, canGive: true }

vi.mock('@/lib/spaces/donations', () => ({ getDonationAsk: async () => state.ask }))
vi.mock('@/lib/billing/space-donation-checkout', () => ({ spaceCanTakeDonations: async () => state.canGive }))
vi.mock('@/lib/spaces/cta-click-token', () => ({ createSpaceCtaClickToken: () => 'tok' }))
vi.mock('@/components/spaces/donations/donate-form', () => ({ DonateForm: () => <button type="button">Give</button> }))
vi.mock('@/components/spaces/donations/donate-cta-tracker', () => ({ DonateCtaTracker: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { DonateBlock } from './donate'
import { markSpotlightPreview } from '@/lib/spaces/spotlight-site'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'

const space = { id: 's1', slug: 'studio' } as unknown as SpaceProfileContext
const render = async (header?: { eyebrow?: string; heading?: string }) => renderToStaticMarkup(await DonateBlock({ space, header }))

// React's cache() holds one marker per request; outside a request it is a fresh object per call, so the preview
// test marks and renders inside one cache scope by mocking the holder instead of relying on it.
vi.mock('@/lib/spaces/spotlight-site', () => {
  let preview = false
  return {
    markSpotlightPreview: () => {
      preview = true
    },
    inSpotlightPreview: () => preview,
    __reset: () => {
      preview = false
    },
  }
})

describe('DonateBlock', () => {
  beforeEach(async () => {
    state.ask = ask
    state.canGive = true
    ;(await import('@/lib/spaces/spotlight-site') as unknown as { __reset: () => void }).__reset()
  })

  it('draws the fund, its words and the give control when the Space can take a gift', async () => {
    const html = await render()
    expect(html).toContain('Keep the studio open')
    expect(html).toContain('Rent and tea.')
    expect(html).toContain('Give')
  })

  it('an owner header replaces the fund label', async () => {
    expect(await render({ heading: 'Back this place' })).toContain('Back this place')
  })

  it('shows a visitor nothing when payouts or the plan are not ready', async () => {
    state.canGive = false
    expect(await render()).toBe('')
  })

  it('shows a visitor nothing when there is no active fund', async () => {
    state.ask = null
    expect(await render()).toBe('')
  })

  it('shows the owner one setup line in the editor preview, and only there', async () => {
    state.canGive = false
    markSpotlightPreview()
    const html = await render()
    expect(html).toContain('Set up your fund')
    expect(html).toContain('/spaces/studio/settings/offerings#donations')
  })
})
