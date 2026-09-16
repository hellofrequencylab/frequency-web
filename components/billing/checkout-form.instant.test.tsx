// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// THE DRAWER MUST NEVER BE EMPTY, AND THE CARD MUST COME FIRST (LIVE-368).
//
// The owner's reading of the live page: "the second button seems really redundant, and it still
// takes forever for the Link section to load." Both complaints had one cause on screen.
// `loader: 'never'` was set to stop two spinners racing for one wait -- and it did, but ours
// stops when the PROVIDER mounts while Stripe's element then does its own fetch. Across that
// window the area was EMPTY, which put the collapse control directly above Stripe's "Pay $44"
// with a void between them. Two controls and nothing else reads as two redundant buttons.
//
// Three claims, and the third is the one the owner asked for by name:
//   · the space is held at the right SHAPE from the first frame, not blank and not a spinner,
//   · the Pay button arrives WITH the fields rather than floating above an empty box, and
//   · `card` is ordered before `link`, so the field every buyer can use is the one that is open.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let fireReady: (() => void) | null = null
let lastOptions: Record<string, unknown> | null = null

let fireExpressReady: ((available: boolean) => void) | null = null
let expressOptions: Record<string, unknown> | null = null
let fireExpressConfirm: (() => Promise<void>) | null = null
type ConfirmResult = { type: string; error?: { message?: string } }
const confirm = vi.fn(async (_args?: Record<string, unknown>): Promise<ConfirmResult> => ({
  type: 'success',
}))

vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCheckout: () => ({ type: 'success', checkout: { confirm } }),
  ExpressCheckoutElement: ({
    onReady,
    onConfirm,
    options,
  }: {
    onReady?: (e: { availablePaymentMethods?: Record<string, boolean> }) => void
    onConfirm?: (e: { paymentFailed: (o: { reason: 'fail' }) => void }) => Promise<void>
    options?: Record<string, unknown>
  }) => {
    expressOptions = options ?? null
    fireExpressReady = (available: boolean) =>
      onReady?.({ availablePaymentMethods: available ? { link: true } : undefined })
    fireExpressConfirm = () => onConfirm!({ paymentFailed: paymentFailed })
    return <div data-testid="express" />
  },
  PaymentElement: ({
    onReady,
    options,
    className,
  }: {
    onReady?: () => void
    options?: Record<string, unknown>
    className?: string
  }) => {
    fireReady = () => onReady?.()
    lastOptions = options ?? null
    return <div data-testid="payment-element" className={className} />
  },
}))

vi.mock('@/lib/billing/stripe-browser', () => ({
  loadStripeBrowser: () => Promise.resolve({ fake: true }),
}))

const paymentFailed = vi.fn()
const CheckoutForm = (await import('./checkout-form')).default

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  fireReady = null
  lastOptions = null
  fireExpressReady = null
  fireExpressConfirm = null
  expressOptions = null
  confirm.mockClear()
  paymentFailed.mockClear()
})

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<CheckoutForm clientSecret="cs_1_secret_x" priceLabel="$44" onFellBack={vi.fn()} onDone={vi.fn()} />)
  })
  return container
}

const skeleton = () => container!.querySelector('[aria-hidden] .motion-safe\\:animate-pulse')
const payButton = () =>
  Array.from(container!.querySelectorAll('button')).find((b) => /Pay/.test(b.textContent ?? ''))

describe('the drawer opens at its final shape', () => {
  it('holds the card space with a skeleton before Stripe paints, and never a blank box', async () => {
    await mount()
    expect(skeleton(), 'the space is shaped, not empty').not.toBeNull()
    expect(container!.textContent, 'and it is not a spinner with a sentence').not.toMatch(/Loading/i)
  })

  // The Pay button over an empty area is exactly what made the live page read as two stacked
  // buttons with nothing between them.
  it('does not show the Pay button until the fields are there', async () => {
    await mount()
    expect(payButton(), 'nothing to pay with yet, so nothing offering to charge').toBeUndefined()
    await act(async () => fireReady!())
    expect(payButton()).toBeDefined()
    expect(payButton()!.textContent).toContain('$44')
  })

  it('swaps the skeleton for the real element once it is ready, without unmounting it', async () => {
    await mount()
    const el = container!.querySelector('[data-testid="payment-element"]')!
    expect(el, 'the element must be IN THE TREE to ever load').not.toBeNull()
    expect(el.className, 'but occupying no space while the skeleton stands in').toContain('h-0')

    await act(async () => fireReady!())
    expect(skeleton(), 'the placeholder goes').toBeNull()
    expect(
      container!.querySelector('[data-testid="payment-element"]'),
      'the same element stays mounted -- a remount would restart its fetch',
    ).toBe(el)
    expect(container!.querySelector('[data-testid="payment-element"]')!.className ?? '').not.toContain('h-0')
  })
})

describe('card first, Link under it', () => {
  it('orders card before link rather than letting Stripe choose', async () => {
    await mount()
    expect(lastOptions?.paymentMethodOrder).toEqual(['card', 'link'])
  })

  // The accordion is what makes "Link as a button under the card" literal: one method open, the
  // rest collapsed rows beneath, and opening one closes the other.
  it('uses the accordion with the first method already open', async () => {
    await mount()
    const layout = lastOptions?.layout as Record<string, unknown>
    expect(layout.type).toBe('accordion')
    expect(layout.defaultCollapsed).toBe(false)
  })

  // 🔴 A DEVICE'S WALLET IS THE DEVICE'S ANSWER, NEVER OURS. This invariant did not go away when
  // the express row took the wallets over -- it MOVED. The card form now says `never` for all
  // three precisely because something else says `auto`, and the pair is what has to hold. An
  // assertion on either half alone would pass while a wallet quietly disappeared.
  it('hides nothing: every wallet the card form gives up is offered by the express row', async () => {
    await mount()
    const card = lastOptions?.wallets as Record<string, string>
    const express = expressOptions?.paymentMethods as Record<string, string>
    for (const w of ['applePay', 'googlePay', 'link'] as const) {
      expect(card[w], `${w} is not offered twice`).toBe('never')
      expect(express[w], `${w} is still offered once`).toBe('auto')
    }
  })
})

describe('Link and the wallets are their own buttons', () => {
  // The owner asked for "Pay $44" and "Link" split apart. The express element is the only
  // supported way to do it: real buttons, above the card form, on the SAME session.
  it('renders an express row and orders Link first', async () => {
    await mount()
    expect(container!.querySelector('[data-testid="express"]')).not.toBeNull()
    expect(expressOptions?.paymentMethodOrder).toEqual(['link'])
  })

  // 🔴 NOT "Link only". Apple Pay and Google Pay are the fastest paths a phone has, and killing
  // them to satisfy the letter of the ask would be a regression for the buyers who convert best.
  it('keeps the device wallets rather than suppressing them to isolate Link', async () => {
    await mount()
    const pm = expressOptions?.paymentMethods as Record<string, string>
    expect(pm.link).toBe('auto')
    expect(pm.applePay).toBe('auto')
    expect(pm.googlePay).toBe('auto')
  })

  // And the card form must not offer them a second time -- the duplication that read as
  // "the Link section" in the first place.
  it('stops the card form offering Link and the wallets a second time', async () => {
    await mount()
    expect(lastOptions?.wallets).toEqual({ applePay: 'never', googlePay: 'never', link: 'never' })
  })

  // A row that would render nothing must not leave a gap above the card fields.
  it('collapses the row when the device offers no Link and no wallet', async () => {
    await mount()
    await act(async () => fireExpressReady!(false))
    expect(container!.querySelector('[data-testid="express"]')).toBeNull()
  })

  it('confirms through the same session as the card form', async () => {
    await mount()
    await act(async () => fireExpressReady!(true))
    await act(async () => {
      await fireExpressConfirm!()
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    const args = confirm.mock.calls[0]?.[0]
    expect(args).toMatchObject({ redirect: 'if_required' })
    expect(args).toHaveProperty('expressCheckoutConfirmEvent')
  })

  // 🔴 Stripe's sheet waits for a verdict. Returning without calling paymentFailed leaves the
  // buyer inside an interface that never resolves.
  it('tells Stripe the payment failed on a decline, so its sheet can close', async () => {
    confirm.mockResolvedValueOnce({ type: 'error', error: { message: 'Card declined.' } })
    await mount()
    await act(async () => fireExpressReady!(true))
    await act(async () => {
      await fireExpressConfirm!()
    })
    expect(paymentFailed).toHaveBeenCalledWith({ reason: 'fail' })
    expect(container!.textContent).toContain('Card declined.')
  })
})
