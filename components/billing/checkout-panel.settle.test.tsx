// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// THE CONFIRMATION IS A PROMISE, AND SOMETHING HAS TO MAKE IT TRUE (LIVE-366).
//
// `confirm({ redirect: 'if_required' })` is what keeps a buyer on the page, and it means the common
// card path NEVER navigates. So the session's `return_url` -- the one carrying
// `session_id={CHECKOUT_SESSION_ID}`, written as the webhook's backstop -- is never visited, and
// the reconcile behind it is unreachable on exactly the path that became the default. Until
// `onPaid` existed, an on-page ticket had ONE way to become real, and if that way was late or
// misconfigured the buyer sat behind a panel reading "a receipt is on its way to your email" while
// no row had flipped and no receipt had been asked for.
//
// Three claims, and the third is the one that matters most:
//   · the panel settles BEFORE it confirms,
//   · a payment with no settle wired still confirms (the webhook is the guarantee), and
//   · A SETTLE THAT THROWS STILL CONFIRMS. The money moved. An error screen after a successful
//     charge is the worst thing this panel could say, and it would send the buyer to pay twice.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Stands in for the lazily-imported Stripe form: exposes a button that "pays". */
let fireDone: (() => void) | null = null
vi.mock('./checkout-form', () => ({
  default: ({ onDone }: { onDone: () => void }) => {
    fireDone = onDone
    return <div data-testid="card-form" />
  },
}))
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    void loader
    return ({ onDone }: { onDone: () => void }) => {
      fireDone = onDone
      return <div data-testid="card-form" />
    }
  },
}))

const CheckoutPanel = (await import('./checkout-panel')).default

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  fireDone = null
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

const text = () => container!.textContent ?? ''

async function pay() {
  await act(async () => {
    fireDone!()
  })
}

describe('paid, and still here', () => {
  // 🔴 THE SETTLE MUST BE AWAITED, and an in-flight settle is the only way to prove it. A fake
  // that resolves immediately passes whether the panel awaits it or fires and forgets, which is
  // the mutation this assertion was rewritten to catch.
  it('waits for the settle before it tells the buyer a receipt is coming', async () => {
    let release: () => void = () => {}
    const settled = new Promise<void>((r) => {
      release = r
    })
    const onPaid = vi.fn(() => settled)
    mount(<CheckoutPanel clientSecret="cs_1_secret_x" onFellBack={vi.fn()} onPaid={onPaid} />)
    expect(text(), 'nothing is promised before the card is submitted').not.toContain('receipt')

    await pay()
    expect(onPaid).toHaveBeenCalledTimes(1)
    expect(text(), 'the promise is not made while the settle is still in flight').not.toContain(
      'You are in.',
    )
    expect(text(), 'and the wait is named rather than blank').toContain('Confirming your payment')

    await act(async () => {
      release()
      await settled
    })
    expect(text()).toContain('You are in.')
    expect(text()).toContain('receipt')
  })

  it('offers a close button on the confirmation', async () => {
    const onClose = vi.fn()
    mount(<CheckoutPanel clientSecret="cs_1_secret_x" onFellBack={vi.fn()} onClose={onClose} />)
    await pay()
    const close = container!.querySelector('button[aria-label="Close"]')!
    expect(close).not.toBeNull()
    await act(async () => close.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onClose).toHaveBeenCalled()
  })

  it('still confirms when no settle is wired, because the webhook is the guarantee', async () => {
    mount(<CheckoutPanel clientSecret="cs_1_secret_x" onFellBack={vi.fn()} />)
    await pay()
    expect(text()).toContain('You are in.')
  })

  // 🔴 The money already moved. A settle that throws is a reconcile problem, never the buyer's.
  it('confirms even when the settle throws, and never shows an error after a successful charge', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onPaid = vi.fn(async () => {
      throw new Error('network')
    })
    mount(<CheckoutPanel clientSecret="cs_1_secret_x" onFellBack={vi.fn()} onPaid={onPaid} />)
    await pay()
    expect(text()).toContain('You are in.')
    expect(err, 'a swallowed failure here is an invisible regression').toHaveBeenCalled()
    err.mockRestore()
  })
})
