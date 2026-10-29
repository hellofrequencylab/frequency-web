// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// THE SPOTLIGHT CAP MOMENT (SPL-11). At the cap a Member sees what they hit, what Crew adds and the contribute
// presets, with "Keep it as it is" as an equal choice; below the cap nothing shows; Crew at 40 is told the
// plain fact and offered nothing to buy.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({ start: vi.fn(), settle: vi.fn(), track: vi.fn() }))
vi.mock('@/app/(main)/upgrade/actions', () => ({ startMembershipCheckout: h.start, settleMembershipCheckoutAction: h.settle }))
vi.mock('@/components/billing/checkout-panel', () => ({
  default: ({ clientSecret }: { clientSecret: string }) => <div data-testid="checkout-panel">{clientSecret}</div>,
}))
vi.mock('@/components/analytics/track-provider', () => ({ trackClient: h.track }))
vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: () => {} }))

import { SaveErrorOrCapPanel } from './spotlight-cap-panel'
import type { SpotlightCapReached } from '@/lib/spotlight/caps'

const member: SpotlightCapReached = { used: 12, allowed: 12, crewAllowed: 40, presetCents: [500, 1000, 2500], suggestedCents: 1000, minCents: 499 }
const crew: SpotlightCapReached = { ...member, used: 40, allowed: 40 }

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  h.start.mockReset()
  h.track.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
const render = (node: React.ReactElement) => act(() => root.render(node))
const button = (label: RegExp) =>
  [...host.querySelectorAll('button')].find((b) => label.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) as HTMLButtonElement | undefined

describe('the Spotlight cap panel', () => {
  it('at the cap: says what they hit, what Crew adds, the presets, and keeps both choices equal', () => {
    render(<SaveErrorOrCapPanel error="full" capReached={member} />)
    expect(host.textContent).toContain('Your Spotlight is full at 12 blocks')
    expect(host.textContent).toContain('Crew adds room for 40 blocks')
    for (const label of [/\$5 a month/, /\$10 a month/, /\$25 a month/]) expect(button(label)).toBeTruthy()
    expect(button(/^\$10 a month/)!.getAttribute('aria-checked')).toBe('true')
    const join = button(/Join Crew at \$10 a month/)!
    const keep = button(/Keep it as it is/)!
    expect(join.className).toBe(keep.className)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('joining uses the existing Crew checkout with the chosen preset', async () => {
    h.start.mockResolvedValue({ data: { clientSecret: 'cs_secret', sessionId: 'cs_1' } })
    render(<SaveErrorOrCapPanel error="full" capReached={member} />)
    act(() => button(/^\$25 a month/)!.click())
    await act(async () => button(/Join Crew at \$25 a month/)!.click())
    expect(h.start).toHaveBeenCalledWith(2500, 'monthly')
    expect(host.querySelector('[data-testid="checkout-panel"]')?.textContent).toBe('cs_secret')
  })

  it('keeping it as it is dismisses the panel and starts no checkout', () => {
    render(<SaveErrorOrCapPanel error="full" capReached={member} />)
    act(() => button(/Keep it as it is/)!.click())
    expect(h.start).not.toHaveBeenCalled()
    expect(host.textContent).toContain('stays as it is')
    expect(button(/Join Crew/)).toBeUndefined()
  })

  it('Crew at 40 is told the fact and offered nothing to buy', () => {
    render(<SaveErrorOrCapPanel error="full" capReached={crew} />)
    expect(host.textContent).toContain('Your Spotlight is full at 40 blocks')
    expect(button(/Join Crew/)).toBeUndefined()
    expect(host.textContent).not.toMatch(/\$\d/)
    expect(button(/Keep it as it is/)).toBeTruthy()
  })

  it('below the cap (no error) renders nothing, and an error without the signal keeps the red line', () => {
    render(<SaveErrorOrCapPanel error={null} capReached={null} />)
    expect(host.innerHTML).toBe('')
    render(<SaveErrorOrCapPanel error="Could not save" capReached={null} />)
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Could not save')
  })

  it('logs one generic event with no personal detail', () => {
    render(<SaveErrorOrCapPanel error="full" capReached={member} />)
    expect(h.track).toHaveBeenCalledWith('pricing.upgrade_moment', { surface: 'spotlight_blocks', action: 'shown', scope: 'personal' })
  })
})
