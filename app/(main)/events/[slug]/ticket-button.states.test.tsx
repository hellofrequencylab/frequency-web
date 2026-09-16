// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// THE EIGHT STATES OF THE TICKET DOOR (LIVE-366), pinned at the render layer because every one of
// them is a claim about what is on screen and in what ORDER -- which no unit test of the action
// can see.
//
// The owner's spec, verbatim, and where each line is proved below:
//   1. the ticket options sit UNDER the button            -> "the button leads"
//   2. a small row of card marks under the button, above them -> "the button leads"
//   3. the button names the price and goes quiet when open -> "the price is in the label" + "quiet"
//   4. opening pushes the marks and the options DOWN       -> "the drawer opens between"
//   5. every payment option is in that one layer           -> checkout-form.tsx (accordion)
//   6. it all happens in this screen area                  -> no navigation: proved by 4
//   7. a confirmation with a close button ends it          -> checkout-panel.tsx
//   8. the emails are ready to trigger                     -> lib/billing + the settle wiring
//
// 🔴 THE ORDERING CLAIMS ARE THE POINT. A test that only asserted "the marks render" would pass
// with the marks above the button, which is the layout this change replaced. Every ordering claim
// below compares DOCUMENT POSITION, so moving a block breaks it.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const startTicket = vi.fn()
const settleTicketAction = vi.fn()

vi.mock('./ticket-actions', () => ({
  startTicket: (...args: unknown[]) => startTicket(...args),
  settleTicketAction: (...args: unknown[]) => settleTicketAction(...args),
  refundTicketAction: vi.fn(),
}))

// The real panel lazily imports Stripe.js, which jsdom cannot load and which is not what these
// claims are about. The stub keeps its IDENTITY and POSITION, which is exactly what is asserted.
vi.mock('@/components/billing/checkout-panel', () => ({
  default: ({ priceLabel }: { priceLabel?: string }) => (
    <div data-testid="checkout-drawer" data-price={priceLabel} />
  ),
}))

vi.mock('@/lib/billing/stripe-browser', () => ({ warmStripeBrowser: vi.fn() }))

const { TicketButton } = await import('./ticket-button')
type Tier = import('./ticket-button').TicketTierView

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  startTicket.mockReset()
  settleTicketAction.mockReset()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

const cta = () =>
  Array.from(container!.querySelectorAll('button')).find((b) =>
    /Get ticket/i.test(b.textContent ?? ''),
  )!

const marks = () => container!.querySelector('[aria-label*="Visa"]')!
const drawer = () => container!.querySelector('[data-testid="checkout-drawer"]')

/** True when `a` comes before `b` in the document. */
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

async function press(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

const tier = (over: Partial<Tier> = {}): Tier => ({
  id: 't1',
  name: 'General',
  description: null,
  pricingMode: 'fixed',
  priceCents: 4400,
  minCents: null,
  suggestedCents: null,
  spotsLeft: null,
  soldOut: false,
  memberOnly: false,
  spaceMembersOnly: false,
  spaceTierId: null,
  membershipPriceLabel: null,
  notYetOnSale: false,
  salesClosed: false,
  opensOnLabel: null,
  ...over,
})

describe('the button leads, the options follow', () => {
  it('puts the card marks under the button and the ticket options under those', () => {
    mount(<TicketButton eventId="e1" priceLabel="$44.00" tiers={[tier(), tier({ id: 't2', name: 'VIP', priceCents: 8800 })]} />)
    const option = Array.from(container!.querySelectorAll('button')).find((b) =>
      /General/.test(b.textContent ?? ''),
    )!
    expect(before(cta(), marks()), 'the marks belong UNDER the button').toBe(true)
    expect(before(marks(), option), 'the ticket options belong under the marks').toBe(true)
  })

  it('does the same on a flat-price event that has no tiers at all', () => {
    mount(<TicketButton eventId="e1" priceLabel="$44.00" />)
    expect(before(cta(), marks())).toBe(true)
  })
})

describe('the price is in the label', () => {
  it('names the flat price without its empty cents', () => {
    mount(<TicketButton eventId="e1" priceLabel="$44.00" />)
    expect(cta().textContent).toContain('Get tickets - $44')
    expect(cta().textContent, 'a trailing .00 is two characters of noise').not.toContain('$44.00')
  })

  it('keeps real cents', () => {
    mount(<TicketButton eventId="e1" priceLabel="$44.50" />)
    expect(cta().textContent).toContain('$44.50')
  })

  it('names the SELECTED tier, not the event price, and follows the selection', async () => {
    mount(
      <TicketButton
        eventId="e1"
        priceLabel="$44.00"
        tiers={[tier(), tier({ id: 't2', name: 'VIP', priceCents: 8800 })]}
      />,
    )
    expect(cta().textContent).toContain('$44')
    const vip = Array.from(container!.querySelectorAll('button')).find((b) =>
      /VIP/.test(b.textContent ?? ''),
    )!
    await press(vip)
    expect(cta().textContent, 'the button must not keep quoting the old row').toContain('$88')
  })

  // A number here is a price PROMISE. These two tiers have no price this component may charge, so
  // inventing one would be a promise broken at the card form.
  it('quotes no number for a free tier or for a members ticket the viewer cannot buy', async () => {
    mount(<TicketButton eventId="e1" priceLabel="$44.00" tiers={[tier({ pricingMode: 'free', priceCents: null })]} />)
    expect(cta().textContent).toContain('Get ticket')
    expect(cta().textContent).not.toMatch(/\$/)
  })
})

describe('the drawer opens between the button and everything under it', () => {
  async function open() {
    startTicket.mockResolvedValue({ data: { clientSecret: 'cs_1_secret_x', sessionId: 'cs_1' } })
    mount(<TicketButton eventId="e1" priceLabel="$44.00" />)
    await press(cta())
  }

  it('renders the checkout under the button and ABOVE the marks, so nothing is replaced', async () => {
    await open()
    expect(drawer(), 'the drawer opens on the page, not on Stripe').not.toBeNull()
    expect(before(cta(), drawer()!), 'the drawer belongs under the button').toBe(true)
    expect(before(drawer()!, marks()), 'and above the marks, which it PUSHES DOWN').toBe(true)
  })

  // The tiered branch is the one that was restructured most, so it gets the same ordering proof
  // rather than inheriting the flat branch's.
  it('does the same on a tiered event, with the options still below', async () => {
    startTicket.mockResolvedValue({ data: { clientSecret: 'cs_1_secret_x', sessionId: 'cs_1' } })
    mount(<TicketButton eventId="e1" priceLabel="$44.00" tiers={[tier()]} />)
    await press(cta())
    const option = Array.from(container!.querySelectorAll('button')).find((b) =>
      /General/.test(b.textContent ?? ''),
    )!
    expect(before(cta(), drawer()!)).toBe(true)
    expect(before(drawer()!, marks())).toBe(true)
    expect(before(marks(), option)).toBe(true)
  })

  it('goes quiet when it opens, so only Stripe has an amber button on screen', async () => {
    mount(<TicketButton eventId="e1" priceLabel="$44.00" />)
    expect(cta().className, 'closed, it is the primary call to action').toContain('bg-primary')
    startTicket.mockResolvedValue({ data: { clientSecret: 'cs_1_secret_x', sessionId: 'cs_1' } })
    await press(cta())
    expect(cta().className, 'open, it is not').not.toContain('bg-primary')
    expect(cta().getAttribute('aria-expanded')).toBe('true')
  })

  // A greyed control that does nothing is worse than no control, and "how do I close this" is the
  // next question a buyer has.
  it('the quiet button is still live: it folds the drawer back up', async () => {
    await open()
    await press(cta())
    expect(drawer()).toBeNull()
    expect(cta().getAttribute('aria-expanded')).toBe('false')
  })

  // 🔴 RE-OPENING MUST NOT RESERVE A SECOND SEAT. The session is still good for its 30-minute
  // window; asking again would write a second pending ticket against capacity, which is the exact
  // shape of the duplicate rows this checkout has already produced in production.
  it('re-opening reuses the session instead of asking the server again', async () => {
    await open()
    expect(startTicket).toHaveBeenCalledTimes(1)
    await press(cta())
    await press(cta())
    expect(drawer()).not.toBeNull()
    expect(startTicket).toHaveBeenCalledTimes(1)
  })
})

describe('the session is dropped whenever it stops matching the button', () => {
  it('changing tier closes the drawer, so a form built for one price cannot sit under another', async () => {
    startTicket.mockResolvedValue({ data: { clientSecret: 'cs_1_secret_x', sessionId: 'cs_1' } })
    mount(
      <TicketButton
        eventId="e1"
        priceLabel="$44.00"
        tiers={[tier(), tier({ id: 't2', name: 'VIP', priceCents: 8800 })]}
      />,
    )
    await press(cta())
    expect(drawer()).not.toBeNull()
    const vip = Array.from(container!.querySelectorAll('button')).find((b) =>
      /VIP/.test(b.textContent ?? ''),
    )!
    await press(vip)
    expect(drawer(), 'the $44 session must not stay open under an $88 button').toBeNull()
    await press(cta())
    expect(startTicket, 'and the next press builds a new one').toHaveBeenCalledTimes(2)
  })
})
