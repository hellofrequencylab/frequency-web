// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'

// THE UPGRADE MOMENT (ADR-1709 §2, LIVE-758). A refusal on the payments gate is never a dead end: the
// panel says what Business adds, starts its trial in place through the Space plan checkout, gives
// "Keep it free" equal weight, never touches the host's draft, and logs one generic event.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
  start: vi.fn(),
  settle: vi.fn(),
  track: vi.fn(),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/billing/actions', () => ({
  startSpaceLoadoutCheckout: h.start,
  settleSpaceLoadoutAction: h.settle,
}))
vi.mock('@/components/billing/checkout-panel', () => ({
  default: ({ clientSecret }: { clientSecret: string }) => <div data-testid="checkout-panel">{clientSecret}</div>,
}))
vi.mock('@/components/analytics/track-provider', () => ({ trackClient: h.track }))
vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: () => {} }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { UpgradeMoment } from './upgrade-moment'
import { BUSINESS_ADDS } from '@/lib/pricing/payments-copy'

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

const offer = { sellable: true, trialDays: 14, monthlyCents: 4900 }
const owner = { spaceSlug: 'house', canUpgrade: true }

function render(node: React.ReactElement) {
  act(() => root.render(node))
}
const button = (label: RegExp) =>
  [...host.querySelectorAll('button, a')].find((b) => label.test(b.textContent ?? '')) as HTMLElement | undefined

describe('the upgrade moment', () => {
  it('lists what Business adds and reads the price from the offer, never a typed figure', () => {
    render(<UpgradeMoment surface="event" target={owner} offer={offer} onKeepFree={() => {}} />)
    for (const line of BUSINESS_ADDS) expect(host.textContent).toContain(line)
    expect(host.textContent).toContain('$49 a month')
    render(<UpgradeMoment surface="event" target={owner} offer={{ ...offer, monthlyCents: 3900 }} onKeepFree={() => {}} />)
    expect(host.textContent).toContain('$39 a month')
  })

  it('gives the trial and "Keep it free" equal weight', () => {
    render(<UpgradeMoment surface="event" target={owner} offer={offer} onKeepFree={() => {}} />)
    const trial = button(/14-day Business trial/)
    const keep = button(/Keep it free/)
    expect(trial && keep).toBeTruthy()
    expect(trial!.className).toBe(keep!.className)
  })

  it('starts the trial in place through the Space plan checkout and mounts the card form', async () => {
    h.start.mockResolvedValue({ data: { clientSecret: 'cs_secret', sessionId: 'cs_1' } })
    render(<UpgradeMoment surface="membership" target={owner} offer={offer} onKeepFree={() => {}} />)
    await act(async () => button(/Business trial/)!.click())
    expect(h.start).toHaveBeenCalledWith('house', { plan: 'business', interval: 'month' })
    expect(host.querySelector('[data-testid="checkout-panel"]')?.textContent).toBe('cs_secret')
  })

  it('opens a hosted checkout in a new tab, so the form behind it is never navigated away', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    h.start.mockResolvedValue({ data: { url: 'https://checkout.example/x' } })
    render(<UpgradeMoment surface="event" target={owner} offer={offer} onKeepFree={() => {}} />)
    await act(async () => button(/Business trial/)!.click())
    expect(open).toHaveBeenCalledWith('https://checkout.example/x', '_blank', 'noopener')
    expect(host.textContent).toContain('Your draft is still on this page')
    open.mockRestore()
  })

  it('"Keep it free" hands back to the form and nothing else', () => {
    const keep = vi.fn()
    render(<UpgradeMoment surface="booking" target={owner} offer={offer} onKeepFree={keep} />)
    act(() => button(/Keep it free/)!.click())
    expect(keep).toHaveBeenCalledTimes(1)
    expect(h.start).not.toHaveBeenCalled()
  })

  it('offers no trial button to a Space editor who is not the owner, or while billing is off', () => {
    render(<UpgradeMoment surface="event" target={{ spaceSlug: 'house', canUpgrade: false }} offer={offer} onKeepFree={() => {}} />)
    expect(button(/Business trial/)).toBeUndefined()
    expect(host.textContent).toContain('The owner of this Space can start its Business trial.')
    render(<UpgradeMoment surface="event" target={owner} offer={{ ...offer, sellable: false }} onKeepFree={() => {}} />)
    expect(button(/Business trial/)).toBeUndefined()
    expect(button(/Keep it free/)).toBeTruthy()
  })

  it('points a personal host at starting a Space, with no checkout', () => {
    render(<UpgradeMoment surface="product" target={{ spaceSlug: null, canUpgrade: false }} offer={offer} onKeepFree={() => {}} />)
    expect(button(/Start a Space for it/)?.getAttribute('href')).toBe('/spaces/new')
    expect(button(/Keep it free/)).toBeTruthy()
  })

  it('logs one generic event with the surface and the choice only', () => {
    render(<UpgradeMoment surface="event" target={owner} offer={offer} onKeepFree={() => {}} />)
    act(() => button(/Keep it free/)!.click())
    expect(h.track).toHaveBeenCalledWith('pricing.upgrade_moment', { surface: 'event', action: 'shown', scope: 'space' })
    expect(h.track).toHaveBeenCalledWith('pricing.upgrade_moment', { surface: 'event', action: 'kept_free', scope: 'space' })
    for (const [, props] of h.track.mock.calls) expect(Object.keys(props).sort()).toEqual(['action', 'scope', 'surface'])
  })

  it('carries no em dashes in what it says', () => {
    render(<UpgradeMoment surface="event" target={owner} offer={offer} onKeepFree={() => {}} />)
    expect(host.textContent).not.toMatch(/—/)
  })

  it('is mounted on the Event, membership, booking and product price surfaces', () => {
    const files = [
      'app/(main)/events/new/event-form.tsx',
      'app/(main)/spaces/[slug]/settings/memberships/section.tsx',
      'app/(main)/spaces/[slug]/settings/services/new/service-spark.tsx',
      'app/(main)/market/sell/product-spark.tsx',
    ]
    for (const f of files) expect(readFileSync(f, 'utf8'), f).toMatch(/upgrade-moment/)
  })
})
