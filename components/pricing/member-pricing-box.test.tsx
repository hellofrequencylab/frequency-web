// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { buildPricingBox, tierForSpacePlan, PRICING_TIER_KEYS, type PricingPersonalContext, type PricingSpaceContext } from '@/lib/pricing/member-pricing'
import { NETWORK_PLAN } from '@/lib/pricing/plans'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import { PWYW_CONFIG_DEFAULT } from '@/lib/pricing/catalog-config'
import { NETWORK_TAKE_RATE_DEFAULT } from '@/lib/billing/pricing-keys'

// The member pricing box (design_handoff_member_pricing): the ladder, the panel, the comparison, and the
// invariants the retired Crew picker and beta toggle carried: an amount under the floor is refused with the
// floor named, a refused beta toggle says why, and a Space that already pays changes plan in the portal and
// never through a second checkout.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  startSpaceLoadoutCheckout: vi.fn(),
  settleSpaceLoadoutAction: vi.fn(),
  openSpaceBillingPortal: vi.fn(),
  startMembershipCheckout: vi.fn(),
  settleMembershipCheckoutAction: vi.fn(),
  toggleMembership: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/billing/actions', () => ({
  startSpaceLoadoutCheckout: mocks.startSpaceLoadoutCheckout,
  settleSpaceLoadoutAction: mocks.settleSpaceLoadoutAction,
  openSpaceBillingPortal: mocks.openSpaceBillingPortal,
}))
vi.mock('@/app/(main)/upgrade/actions', () => ({
  startMembershipCheckout: mocks.startMembershipCheckout,
  settleMembershipCheckoutAction: mocks.settleMembershipCheckoutAction,
  toggleMembership: mocks.toggleMembership,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }))
vi.mock('@/components/billing/checkout-panel', () => ({ default: () => <div data-checkout-panel /> }))
vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: () => {} }))

const { MemberPricingBox } = await import('./member-pricing-box')

const data = buildPricingBox({ crew: PWYW_CONFIG_DEFAULT, trialDays: 14, takeRate: NETWORK_TAKE_RATE_DEFAULT })
const allSell = { business: true, collective: true, network: true, nonprofit: true, nonprofit_collective: true }
const freeSpace: PricingSpaceContext = { slug: 'hub', name: 'Hub', plan: 'free', canBuy: true, paid: false, verified: false, inherited: false, sellable: allSell }
const member: PricingPersonalContext = { tier: 'member', crewSellable: true, betaOpen: false }

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  class IO {
    observe() {}
    disconnect() {}
  }
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = IO
})
afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(props: Partial<Parameters<typeof MemberPricingBox>[0]> = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<MemberPricingBox data={data} focus="space" personal={member} space={freeSpace} {...props} />))
  return container
}
const tab = (el: HTMLElement, name: string) => [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.includes(name)) as HTMLElement
const click = (node: Element) => act(() => (node as HTMLElement).click())
const cta = (el: HTMLElement) => el.querySelector('.pbx-foot .pbx-cta') as HTMLButtonElement

describe('the member pricing box', () => {
  it('draws six rungs and opens on the rung above the current plan, with the catalog price', () => {
    const el = mount()
    expect([...el.querySelectorAll('[role="tab"]')]).toHaveLength(6)
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Business')
    expect(el.querySelector('.pbx-price')?.textContent).toContain('$49')
    expect(el.querySelector('.pbx-step')?.textContent).toBe('4 of 6')
  })

  it('moves to another rung and shows its price, the yearly figure and the list anchor', () => {
    const el = mount()
    click(tab(el, 'Collective'))
    expect(el.querySelector('.pbx-price b')?.textContent).toBe('$99')
    expect(el.querySelector('.pbx-price s')?.textContent).toBe('$149')
    click(el.querySelectorAll('.pbx-period button')[1] as Element)
    expect(el.querySelector('.pbx-price b')?.textContent).toBe('$990')
  })

  it('steps with the arrow keys while the ladder has focus', () => {
    const el = mount()
    const ladder = el.querySelector('.pbx-ladder') as HTMLElement
    act(() => {
      ladder.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Collective')
  })

  it('opens an on-page Space checkout for a free Space and states the trial', async () => {
    mocks.startSpaceLoadoutCheckout.mockResolvedValue({ data: { clientSecret: 'cs_1', sessionId: 'sess_1' } })
    const el = mount()
    await act(async () => cta(el).click())
    expect(mocks.startSpaceLoadoutCheckout).toHaveBeenCalledWith('hub', { plan: 'business', interval: 'month', networkPackage: false })
    expect(el.querySelector('.pbx-co')?.textContent).toContain('Free for 14 days, then $49/mo')
    expect(el.querySelector('[data-checkout-panel]')).not.toBeNull()
  })

  it('sends a Space that already pays to the billing portal, never a second checkout', async () => {
    mocks.openSpaceBillingPortal.mockResolvedValue({ data: { url: 'about:blank#portal' } })
    const el = mount({ space: { ...freeSpace, plan: 'business', paid: true } })
    click(tab(el, 'Collective'))
    expect(cta(el).textContent).toBe('Upgrade to Collective')
    await act(async () => cta(el).click())
    expect(mocks.openSpaceBillingPortal).toHaveBeenCalledWith('hub')
    expect(mocks.startSpaceLoadoutCheckout).not.toHaveBeenCalled()
  })

  it('refuses a Crew amount under the floor and names the floor', async () => {
    const el = mount({ focus: 'personal', space: null })
    click(tab(el, 'Crew'))
    await act(async () => cta(el).click())
    const input = el.querySelector('.pbx-co input') as HTMLInputElement
    expect(input).not.toBeNull()
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      set.call(input, '1')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const go = el.querySelector('.pbx-co .pbx-cta') as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(go.textContent).toContain('$4.99')
  })

  it('shows the beta toggle error when the server refuses it', async () => {
    mocks.toggleMembership.mockResolvedValue({ error: 'Manage your membership in billing.' })
    const el = mount({ focus: 'personal', space: null, personal: { tier: 'member', crewSellable: false, betaOpen: true } })
    click(tab(el, 'Crew'))
    await act(async () => cta(el).click())
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Manage your membership in billing.')
  })

  it('points a member with no Space at opening one', () => {
    const el = mount({ focus: 'personal', space: null })
    click(tab(el, 'Business'))
    expect(cta(el).textContent).toContain('Open a Space')
  })
})

describe('the pricing box data', () => {

  // The member pricing box's data: every figure is READ from the catalog, the rung order is the canon, and the
  // facts the design handoff got wrong stay corrected (a free Space has no funnel, Crew presets are the catalog's,
  // the fee is the operator's number, Non Profit Collective is its own price).

  const box = buildPricingBox({
    crew: PWYW_CONFIG_DEFAULT,
    trialDays: 14,
    takeRate: NETWORK_TAKE_RATE_DEFAULT,
    now: new Date('2026-10-23T00:00:00Z'),
  })
  const by = (key: string) => box.tiers.find((t) => t.key === key)!

  describe('buildPricingBox', () => {
    it('has the six rungs in ladder order, five features each', () => {
      expect(box.tiers.map((t) => t.key)).toEqual([...PRICING_TIER_KEYS])
      for (const t of box.tiers) expect(t.features).toHaveLength(5)
    })

    it('reads prices from the catalog: Business $49, Collective $99 under a $149 list, Network from $476', () => {
      expect(by('business').monthlyCents).toBe(4900)
      expect(by('business').yearlyCents).toBe(49000)
      expect(by('business').nonprofitMonthlyCents).toBe(3900)
      expect(by('collective').monthlyCents).toBe(9900)
      expect(by('collective').listMonthlyCents).toBe(14900)
      expect(by('collective').nonprofitMonthlyCents).toBe(11900)
      expect(by('network').monthlyCents).toBe(NETWORK_PLAN.baseCents + 3 * NETWORK_PLAN.chapterCents)
      expect(by('network').monthlyCents).toBe(47600)
      expect(by('network').nonprofitMonthlyCents).toBe(38000)
      expect(by('network').from).toBe(true)
    })

    it('gives Crew no single price and carries the catalog amounts', () => {
      expect(by('crew').pwyw).toBe(true)
      expect(by('crew').monthlyCents).toBeNull()
      expect(box.crew.presetCents).toEqual([500, 1000, 2500])
      expect(box.crew.minCents).toBe(499)
    })

    it('states allowances from the meter map, not from typed copy', () => {
      const qr = PLACEHOLDER_METER_LIMITS.space_qr!
      expect(by('business').features.join(' ')).toContain(`${qr.business} editable QR codes`)
      expect(by('collective').features.join(' ')).toContain(`${qr.collective} editable QR codes`)
    })

    it('does not promise a funnel on the free Space (the free limit is 0)', () => {
      expect(PLACEHOLDER_METER_LIMITS.space_funnels!.free).toBe(0)
      expect(by('space').features.join(' ')).not.toMatch(/funnel/i)
    })

    it('prints the operator network fee per rung and never says 0% without card processing', () => {
      const fee = box.comparison.find((r) => r.label === 'Network fee')!
      expect(fee.cells.slice(3)).toEqual(['5%', '3%', '2%'])
      for (const t of box.tiers) for (const f of t.features) if (/\b0%|no fee/i.test(f)) expect(f).toMatch(/card processing/i)
      expect(by('space').features.join(' ')).toContain('plus card processing')
    })

    it('uses no em dashes in any line', () => {
      const lines = [...box.tiers.flatMap((t) => [t.fit, ...t.features, t.note.month, t.note.year]), ...box.comparison.flatMap((r) => [r.label, ...r.cells])]
      for (const l of lines) expect(l).not.toContain('—')
    })

    it('has one comparison cell per rung in every row', () => {
      for (const row of box.comparison) expect(row.cells).toHaveLength(6)
    })

    it('maps a Space plan label to its rung', () => {
      expect(tierForSpacePlan('free')).toBe('space')
      expect(tierForSpacePlan('nonprofit')).toBe('business')
      expect(tierForSpacePlan('nonprofit_collective')).toBe('collective')
      expect(tierForSpacePlan('network')).toBe('network')
      expect(tierForSpacePlan(null)).toBe('space')
    })
  })

})
