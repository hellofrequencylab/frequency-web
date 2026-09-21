// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// THE PUBLIC GUEST BUY CONTROL (LIVE-396). What these pin:
//   * the honeypot's value is actually SENT. The first draft of this component rendered the field
//     and never forwarded it, which is a decoration rather than a trap — the action would have
//     seen `company: undefined` from every bot. This is the regression test for that.
//   * `forceHosted` is unconditional. This door lives on an ISR, crawlable page under app/discover
//     and must never ask for the on-page Stripe form.
//   * a returned URL navigates, and an error is shown rather than swallowed.

const startGuestCheckoutAction = vi.fn(async (_i: Record<string, unknown>) => ({
  url: 'https://stripe.test/cs_1',
}) as { url?: string; error?: string })
vi.mock('@/app/(main)/marketplace/commerce-actions', () => ({
  startGuestCheckoutAction: (i: Record<string, unknown>) => startGuestCheckoutAction(i),
}))

import { JourneyGuestBuy } from './journey-guest-buy'

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <JourneyGuestBuy productId="p1" priceLabel="$444" signInHref="/sign-in?next=%2Fjourneys%2Fx" />,
    )
  })
  return container
}

async function submitWith(company: string | null) {
  const el = mount()
  const email = el.querySelector<HTMLInputElement>('#guest-buy-email')!
  // Set through the native setter so React's onChange sees it.
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(email, 'sam@example.com')
  email.dispatchEvent(new Event('input', { bubbles: true }))
  if (company !== null) {
    const pot = el.querySelector<HTMLInputElement>('#guest-buy-company')!
    pot.value = company
  }
  await act(async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  return el
}

beforeEach(() => {
  startGuestCheckoutAction.mockClear()
  startGuestCheckoutAction.mockResolvedValue({ url: 'https://stripe.test/cs_1' })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

describe('JourneyGuestBuy', () => {
  it('shows the price on the button and offers the member door beside it', () => {
    const el = mount()
    expect(el.textContent).toContain('Get access · $444')
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/sign-in?next=%2Fjourneys%2Fx')
  })

  it('keeps the honeypot out of sight and out of the tab order', () => {
    const el = mount()
    const pot = el.querySelector<HTMLInputElement>('#guest-buy-company')!
    expect(pot.tabIndex).toBe(-1)
    expect(pot.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(pot.type).toBe('text')
  })

  it('🔴 FORWARDS the honeypot value, so the trap is real', async () => {
    await submitWith('Acme')
    expect(startGuestCheckoutAction).toHaveBeenCalledTimes(1)
    expect(startGuestCheckoutAction.mock.calls[0][0].company).toBe('Acme')
  })

  it('sends an empty honeypot for a real person, and always asks for the hosted page', async () => {
    await submitWith(null)
    const arg = startGuestCheckoutAction.mock.calls[0][0]
    expect(arg.company).toBe('')
    expect(arg.email).toBe('sam@example.com')
    expect(arg.productId).toBe('p1')
    expect(arg.forceHosted).toBe(true)
  })

  it('shows an error rather than swallowing it', async () => {
    startGuestCheckoutAction.mockResolvedValue({ error: 'This Journey is full. Check back soon.' })
    const el = await submitWith(null)
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('This Journey is full')
  })

  it('never leaves the button dead when the action returns nothing usable', async () => {
    startGuestCheckoutAction.mockResolvedValue({})
    const el = await submitWith(null)
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/could not start checkout/i)
  })
})
