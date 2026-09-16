// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// WHAT A SIGNED-OUT VISITOR CAN ACTUALLY DO ON A PRICED EVENT.
//
// The defect this form was written against was invisible to every unit test in the ticketing
// stack: `startTicket` worked, `createTicketCheckout` worked, the tiers loaded — and 14 of 15
// upcoming events still showed a signed-out visitor the sentence "Sign in to get your ticket."
// The dead end was a RENDER-layer fact, so it needs a render-layer proof.
//
// Each claim below is a way the door silently closes again:
//   · the form renders at all for a signed-out viewer in tickets mode,
//   · the honeypot stays unreachable by sight, by screen reader, AND by keyboard (an
//     `aria-hidden` field that is still tabbable is a trap for people, not for bots),
//   · a members-only tier is not offered, because the server would refuse it and a row that
//     cannot be bought is a dead end dressed as a choice,
//   · the submit reaches the action with a normalised address,
//   · a refusal comes back as an announced alert rather than a silent no-op, and
//   · a FREE tier asks for the address like any other rate (LIVE-318: the claim is a guest RSVP
//     row), sends the tier id, and a `free` reply swaps the form for the guest RSVP confirmation
//     rather than reloading a page that, for a signed-out viewer, would show the form again.

// React needs to be told this is an act environment, or every state flush warns and some are
// skipped. Same line the other client-component suites carry.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const startGuestTicket = vi.fn()

vi.mock('@/app/(main)/events/[slug]/ticket-actions', () => ({
  startGuestTicket: (...args: unknown[]) => startGuestTicket(...args),
  settleTicketAction: vi.fn(),
}))

const { GuestTicketForm } = await import('./guest-ticket-form')
type Tier = import('./guest-ticket-form').GuestTicketTier

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  startGuestTicket.mockReset()
  startGuestTicket.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/test' } })
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
  return container!
}

function tier(over: Partial<Tier> & { id: string; name: string }): Tier {
  return {
    description: null,
    pricingMode: 'fixed',
    priceCents: 2500,
    minCents: null,
    suggestedCents: null,
    soldOut: false,
    memberOnly: false,
    spaceMembersOnly: false,
    ...over,
  } as Tier
}

const SIGN_IN = '/sign-in?next=/events/sunrise-swim'

/** Fill the uncontrolled fields and fire the form's real submit path. */
async function submit(el: HTMLElement, values: { email: string; name?: string; company?: string }) {
  const form = el.querySelector('form') as HTMLFormElement
  const field = (name: string) => form.querySelector(`input[name="${name}"]`) as HTMLInputElement
  field('email').value = values.email
  if (values.name != null) field('name').value = values.name
  if (values.company != null) field('company').value = values.company
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('the signed-out door on a priced event is a purchase, not a sign-in wall', () => {
  it('renders a real form for a signed-out viewer in tickets mode, with the price on the button', () => {
    const el = mount(<GuestTicketForm eventId="e1" priceLabel="$25.00" signInHref={SIGN_IN} />)
    expect(el.querySelector('form')).toBeTruthy()
    expect(el.querySelector('input[name="email"]')).toBeTruthy()
    // The price is said plainly on the control that charges it, and it is the SAME label the
    // signed-in door shows (LIVE-366): a member and a guest buying one ticket must not read two
    // different sentences, and the help centre names this label once for both.
    expect(el.textContent).toContain('Get tickets - $25')
    expect(el.textContent, 'the empty cents are noise in a CTA').not.toContain('$25.00')
    // The one promise the page is allowed to make before payment.
    expect(el.textContent).toContain('No account needed.')
    // And the thing that must NOT be here.
    expect(el.textContent).not.toContain('Sign in to get your ticket')
  })

  it('🔴 keeps the honeypot out of sight, out of the a11y tree, and out of tab order', () => {
    const el = mount(<GuestTicketForm eventId="e1" priceLabel="$25.00" signInHref={SIGN_IN} />)
    const pot = el.querySelector('input[name="company"]') as HTMLInputElement
    expect(pot).toBeTruthy()
    // Tab order: a keyboard user must never land in it.
    expect(pot.tabIndex).toBe(-1)
    const wrap = pot.closest('[aria-hidden="true"]') as HTMLElement
    expect(wrap).toBeTruthy()
    // Sight: hidden by class, not merely by aria (and not by `type="hidden"`, which no bot fills).
    expect(wrap.className).toContain('hidden')
    expect(pot.type).toBe('text')
  })

  it('does not offer a guest a tier they could never buy', () => {
    const el = mount(
      <GuestTicketForm
        eventId="e1"
        signInHref={SIGN_IN}
        tiers={[
          tier({ id: 't1', name: 'Day pass' }),
          tier({ id: 't2', name: 'Member circle seat', spaceMembersOnly: true, priceCents: 0, pricingMode: 'free' }),
          tier({ id: 't3', name: 'Crew rate', memberOnly: true }),
        ]}
      />,
    )
    expect(el.textContent).toContain('Day pass')
    expect(el.textContent).not.toContain('Member circle seat')
    expect(el.textContent).not.toContain('Crew rate')
    // One offerable tier means one rate row, not three.
    expect(el.querySelectorAll('button[aria-pressed]')).toHaveLength(1)
  })

  it('every tier gated: says which door is theirs instead of a control the server would refuse', () => {
    const el = mount(
      <GuestTicketForm
        eventId="e1"
        signInHref={SIGN_IN}
        tiers={[tier({ id: 't2', name: 'Member seat', spaceMembersOnly: true })]}
      />,
    )
    expect(el.querySelector('form')).toBeNull()
    expect(el.querySelector(`a[href="${SIGN_IN}"]`)).toBeTruthy()
  })

  it('a free tier asks for the address like any other rate, and says nothing about payment (LIVE-318)', () => {
    const el = mount(
      <GuestTicketForm
        eventId="e1"
        signInHref={SIGN_IN}
        tiers={[
          tier({ id: 't1', name: 'Community ticket', pricingMode: 'free', priceCents: 0 }),
          tier({ id: 't2', name: 'Day pass' }),
        ]}
      />,
    )
    // Both rates stay listed, so the paid one is one tap away.
    expect(el.querySelectorAll('button[aria-pressed]')).toHaveLength(2)
    // The free one (selected first) is a real form: the address IS the claim.
    expect(el.querySelector('input[name="email"]')).toBeTruthy()
    expect(el.querySelector('button[type="submit"]')).toBeTruthy()
    // Free says "Get ticket" with no price appended: the old 'Get ticket · Free' printed a
    // price label for something that costs nothing, and "buy" would be a lie here.
    expect(el.textContent).toContain('Get ticket')
    // Scoped to the BUTTON, not the page: the tier list beside it legitimately prints "$25.00"
    // for the paid rate, and a price in a list is a fact while a price in a CTA is a promise.
    const cta = el.querySelector('button[type="submit"]')!
    expect(cta.textContent, 'no price is appended to something that costs nothing').not.toMatch(/\$/)
    expect(el.textContent).not.toContain('· Free')
    expect(el.textContent).toContain('No account needed.')
    // And it does not promise a payment screen that will never come.
    expect(el.textContent).not.toContain('Payment happens on the next screen')
    // The sign-in wall that stood here is gone.
    expect(el.textContent).not.toContain('a free ticket needs an account')
    expect(el.querySelector(`a[href="${SIGN_IN}"]`)).toBeNull()
  })

  it('a free claim sends the tier id and swaps the form for the guest RSVP confirmation', async () => {
    startGuestTicket.mockResolvedValue({ data: { free: true } })
    const el = mount(
      <GuestTicketForm
        eventId="ev-77"
        signInHref={SIGN_IN}
        tiers={[tier({ id: 't1', name: 'Community ticket', pricingMode: 'free', priceCents: 0 })]}
      />,
    )
    await submit(el, { email: 'ada@example.com', name: 'Ada' })
    expect(startGuestTicket).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-77', email: 'ada@example.com', name: 'Ada', ticketTypeId: 't1' }),
    )
    // The same words the guest RSVP form shows, announced, with the form gone.
    const status = el.querySelector('[role="status"]')
    expect(status).toBeTruthy()
    expect(status!.textContent).toContain('Check your email')
    expect(status!.textContent).toContain('No account needed.')
    expect(el.querySelector('form')).toBeNull()
    // Nothing on screen claims a seat: the room may have been full.
    expect(el.textContent).not.toMatch(/you're going/i)
  })

  it('sends the normalised email and the selected tier to the guest action', async () => {
    const el = mount(
      <GuestTicketForm
        eventId="ev-77"
        signInHref={SIGN_IN}
        tiers={[tier({ id: 't1', name: 'Day pass' })]}
      />,
    )
    await submit(el, { email: '  Ada@Example.COM  ', name: ' Ada ' })
    expect(startGuestTicket).toHaveBeenCalledTimes(1)
    expect(startGuestTicket).toHaveBeenCalledWith({
      eventId: 'ev-77',
      email: 'ada@example.com',
      name: 'Ada',
      ticketTypeId: 't1',
      amountCents: undefined,
      qty: 1,
      company: '',
    })
  })

  it('carries the honeypot through untouched, so the server can judge it', async () => {
    const el = mount(<GuestTicketForm eventId="ev-77" priceLabel="$25.00" signInHref={SIGN_IN} />)
    await submit(el, { email: 'bot@example.com', company: 'Acme Bots' })
    expect(startGuestTicket.mock.calls[0][0]).toMatchObject({
      company: 'Acme Bots',
      ticketTypeId: null,
    })
  })

  it('a refusal is announced beside the field, not swallowed', async () => {
    startGuestTicket.mockResolvedValue({ error: 'Tickets for this event are sold out.' })
    const el = mount(<GuestTicketForm eventId="e1" priceLabel="$25.00" signInHref={SIGN_IN} />)
    await submit(el, { email: 'ada@example.com' })
    const alert = el.querySelector('[role="alert"]') as HTMLElement
    expect(alert).toBeTruthy()
    expect(alert.textContent).toBe('Tickets for this event are sold out.')
    // The field points at the message, so it is read on focus rather than only seen.
    const email = el.querySelector('input[name="email"]') as HTMLInputElement
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe(alert.id)
    expect(alert.id).toBeTruthy()
  })
})
