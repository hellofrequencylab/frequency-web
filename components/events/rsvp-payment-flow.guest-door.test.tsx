// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// WHICH DOOR A SIGNED-OUT READER GETS ON A PRICED EVENT (LIVE-314).
//
// The flow's guest door was `!signedIn && paymentsReady && guestTiers.length > 0`, and its
// fallback was "Sign in to RSVP". `paymentsReady` is ticketing on AND the host's payouts connected.
// On an RSVP-mode event nothing goes through checkout at RSVP time: money is paid at the door, and
// a signed-in member gets full RSVP controls whether or not payouts are connected. The guest was
// refused for a condition that charges nobody. On a TICKETS-mode event buying is attending, so
// the refusal is right there, and `capture_guest_rsvp` refuses a tickets-mode event anyway.
//
// The verdict is a render-layer fact, so it needs a render-layer proof. Three claims:
//   · signed out + RSVP mode + payouts not ready renders the guest RSVP form,
//   · signed out + tickets mode + payouts not ready does NOT (the sign-in link stands), and
//   · flipping only the mode flips the verdict, so nothing else in the fixture is carrying it.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/app/(main)/events/guest-rsvp-actions', () => ({ submitGuestRsvp: vi.fn() }))
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus: vi.fn(), setRsvpPlusOnes: vi.fn() }))
vi.mock('@/app/(main)/events/[slug]/ticket-actions', () => ({
  startTicket: vi.fn(),
  startGuestTicket: vi.fn(),
}))
vi.mock('@/app/(main)/events/[slug]/social-actions', () => ({ setEventRsvpDepth: vi.fn() }))
vi.mock('@/lib/spaces/memberships-actions', () => ({
  joinTier: vi.fn(),
  startSpaceMembershipCheckout: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const { RsvpPaymentFlow } = await import('./rsvp-payment-flow')
type Props = Parameters<typeof RsvpPaymentFlow>[0]

let container: HTMLDivElement | null = null
let root: Root | null = null

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

function unmount() {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
}

const SIGN_IN = '/sign-in?next=/events/sunrise-swim'

/** A signed-out reader on a priced event whose host has not connected payouts. Only `mode` varies. */
function signedOut(over: Partial<Props>): Props {
  return {
    eventId: 'ev-1',
    slug: 'sunrise-swim',
    rates: [
      {
        id: 'general',
        name: 'Day pass',
        priceLabel: '$25.00',
        kind: 'general',
        ticketTypeId: 't1',
        covered: false,
        tag: null,
      },
      {
        id: 'membership',
        name: 'Member rate',
        priceLabel: 'Included',
        kind: 'membership',
        ticketTypeId: null,
        covered: false,
        tag: 'membership',
      },
    ],
    status: null,
    plusOnes: 0,
    isFull: false,
    initialNote: '',
    membership: null,
    paymentsReady: false,
    signedIn: false,
    signInHref: SIGN_IN,
    guestTiers: [
      {
        id: 't1',
        name: 'Day pass',
        description: null,
        pricingMode: 'fixed',
        priceCents: 2500,
        minCents: null,
        suggestedCents: null,
        soldOut: false,
        memberOnly: false,
        spaceMembersOnly: false,
      },
    ],
    mode: 'rsvp',
    ...over,
  }
}

const guestForm = (el: HTMLElement) => el.querySelector('form input[name="email"]')
const signInLink = (el: HTMLElement) => el.querySelector(`a[href="${SIGN_IN}"]`)

describe('the signed-out door on a priced RSVP-mode event is the guest RSVP form, not a sign-in wall', () => {
  it('RSVP mode, payouts not connected: renders the guest RSVP form', () => {
    const el = mount(<RsvpPaymentFlow {...signedOut({ mode: 'rsvp' })} />)
    expect(guestForm(el)).toBeTruthy()
    expect(signInLink(el)).toBeNull()
    expect(el.textContent).not.toContain('Sign in to RSVP')
    // The money is at the door and the form says so, instead of "Free to join."
    expect(el.textContent).toContain('Pay the $25.00 at the door.')
    expect(el.textContent).not.toContain('Free to join.')
    // A guest cannot hold a membership, so the membership rate is not in the guest's list.
    expect(el.textContent).toContain('Day pass')
    expect(el.textContent).not.toContain('Member rate')
  })

  it('tickets mode, payouts not connected: does NOT render the guest RSVP form', () => {
    const el = mount(<RsvpPaymentFlow {...signedOut({ mode: 'tickets' })} />)
    expect(guestForm(el)).toBeNull()
    expect(signInLink(el)).toBeTruthy()
    expect(el.textContent).toContain('Sign in to RSVP')
  })

  it('control: only the mode differs between the two fixtures, and it alone flips the verdict', () => {
    const rsvp = signedOut({ mode: 'rsvp' })
    const tickets = signedOut({ mode: 'tickets' })
    const { mode: a, ...restRsvp } = rsvp
    const { mode: b, ...restTickets } = tickets
    expect(a).not.toBe(b)
    expect(restRsvp).toEqual(restTickets)
    expect(!!guestForm(mount(<RsvpPaymentFlow {...rsvp} />))).toBe(true)
    unmount()
    expect(!!guestForm(mount(<RsvpPaymentFlow {...tickets} />))).toBe(false)
  })

  it('the booking window gates the guest door the way it gates the free path', () => {
    const el = mount(
      <RsvpPaymentFlow
        {...signedOut({ mode: 'rsvp', rsvpWindowOpen: false, rsvpWindowLine: 'RSVPs closed on Friday.' })}
      />,
    )
    expect(guestForm(el)).toBeNull()
    expect(el.textContent).toContain('RSVPs closed on Friday.')
  })

  it('a purchasable door still wins when checkout can charge', () => {
    const el = mount(<RsvpPaymentFlow {...signedOut({ mode: 'rsvp', paymentsReady: true })} />)
    // The guest TICKET form, not the guest RSVP form: its button carries the price AND the verb
    // that says money moves.
    expect(el.textContent).toContain('Buy ticket')
    expect(el.textContent).not.toContain('at the door')
  })
})
