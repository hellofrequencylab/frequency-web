// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// THE ANSWER SWITCH ON A TICKETED EVENT (owner report 2026-09-16).
//
// The owner bought a ticket and reported three things. This file owns the second and third:
// "RSVP buttons should always be visible", and a press with no ticket "goes grey and opens the
// ticket payment section". Before this change, `page.tsx` rendered an explicit `null` for a ticket
// holder and every surrounding branch was guarded `!ticketsMode &&`, so on a ticketed event NO
// member ever saw an RSVP control at all.
//
// Which control a viewer gets is a RENDER-LAYER verdict, so it needs a render-layer proof. What is
// asserted here is the decision, not the styling:
//   · a door is listening  → the press opens checkout and records NOTHING,
//   · no door is listening → the press records an ORDINARY RSVP,
//   · the viewer holds a ticket → ordinary switch, even with a door on the page,
//   · the booking window is shut and there is no door → Going is not offered, because
//     `setRsvpStatus` would return without writing and the control would read as saved.
//
// Sibling of ./rsvp-payment-flow.guest-door.test.tsx, which proves the same class of verdict for
// the signed-out reader on a priced RSVP-mode event.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const actions = vi.hoisted(() => ({ setRsvpStatus: vi.fn(async () => ({ ok: true })), setRsvpPlusOnes: vi.fn() }))
vi.mock('@/app/(main)/events/actions', () => actions)
vi.mock('@/app/(main)/events/[slug]/social-actions', () => ({ setEventRsvpDepth: vi.fn() }))
vi.mock('@/app/(main)/events/[slug]/manage/questionnaire-actions', () => ({
  loadGuestQuestionnaire: vi.fn(async () => null),
  saveGuestAnswer: vi.fn(),
}))

const { TicketedRsvpControls } = await import('./ticketed-rsvp-controls')
const { JoinIntentProvider, useJoinIntent } = await import('./join-intent')

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

/** Stands in for `TicketButton`: registers an opener exactly as the real door does, in an effect. */
function FakeTicketDoor({ onOpen }: { onOpen: () => void }) {
  const joinIntent = useJoinIntent()
  // No dependency array, matching the real door — it re-registers every render so the opener it
  // hands over always closes over the CURRENT tier selection.
  useEffect(() => {
    joinIntent?.registerTicketDoor(onOpen)
    return () => joinIntent?.registerTicketDoor(null)
  })
  return <div data-testid="ticket-door" />
}

const BASE = {
  eventId: 'ev-1',
  slug: 'hypnotic-sound',
  status: null as null,
  plusOnes: 0,
  isFull: false,
  rsvpWindowOpen: true,
}

/** The Going segment, found by its label rather than its position in the grid. */
function goingButton(el: HTMLElement): HTMLButtonElement | null {
  return (
    [...el.querySelectorAll('button')].find((b) =>
      /^(going|join waitlist|on waitlist)$/i.test((b.textContent ?? '').trim()),
    ) ?? null
  )
}

describe('a ticketed event offers the switch, and the press goes where it can actually work', () => {
  it('hands a Going press to the ticket door and records NOTHING', () => {
    const open = vi.fn()
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={open} />
        <TicketedRsvpControls {...BASE} holdsTicket={false} />
      </JoinIntentProvider>,
    )
    const going = goingButton(el)
    expect(going).not.toBeNull()
    act(() => going!.click())
    // 🔴 THE WHOLE POINT. On a ticketed event the way in is a ticket, so this press must open
    // checkout and must NOT write a going RSVP the buyer has not paid for.
    expect(open).toHaveBeenCalledTimes(1)
    expect(actions.setRsvpStatus).not.toHaveBeenCalled()
  })

  it('greys the segment and says where to go next, so the press is never inert', () => {
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={vi.fn()} />
        <TicketedRsvpControls {...BASE} holdsTicket={false} />
      </JoinIntentProvider>,
    )
    expect(el.textContent).not.toContain('Pick your ticket below')
    act(() => goingButton(el)!.click())
    expect(el.textContent).toContain('Pick your ticket below')
  })

  it('records an ORDINARY RSVP when no door is listening', () => {
    // Sold out, sales closed, no payout account: nothing mounts a ticket door. Saying you are
    // coming is then the only thing the page can mean, and greying a control that opens nothing
    // would be the dead UI this change removes.
    const el = mount(
      <JoinIntentProvider>
        <TicketedRsvpControls {...BASE} holdsTicket={false} />
      </JoinIntentProvider>,
    )
    act(() => goingButton(el)!.click())
    expect(actions.setRsvpStatus).toHaveBeenCalledWith('ev-1', 'going', expect.anything())
  })

  it('gives a ticket holder the ordinary switch, even with a door on the page', () => {
    // ⚠️ THE STATUS HERE IS `not_going`, AND THAT IS THE WHOLE TEST. The first version passed
    // `status="going"`, which proved nothing: `RsvpControls` skips the intercept whenever the
    // viewer is already going, so the assertion held with the `holdsTicket` guard deleted. A
    // mutation that sent ticket holders to checkout passed it. The case where the guard actually
    // bites is a ticket holder who answered "Can't go" and then changes their mind — without it,
    // pressing Going would open a checkout to sell them a SECOND ticket for an event they already
    // hold one for.
    const open = vi.fn()
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={open} />
        <TicketedRsvpControls {...BASE} holdsTicket status="not_going" />
      </JoinIntentProvider>,
    )
    act(() => goingButton(el)!.click())
    expect(open).not.toHaveBeenCalled()
    expect(actions.setRsvpStatus).toHaveBeenCalledWith('ev-1', 'going', expect.anything())
  })

  it('lets a ticket holder who is going step back out, without offering them another ticket', () => {
    const open = vi.fn()
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={open} />
        <TicketedRsvpControls {...BASE} holdsTicket status="going" />
      </JoinIntentProvider>,
    )
    // Their seat exists (the settle path mints it), so Going is lit and pressing it steps back out
    // like anywhere else. The ticket they hold is untouched; "can't make it" is real information
    // for the host and is not a refund request.
    act(() => goingButton(el)!.click())
    expect(open).not.toHaveBeenCalled()
    expect(actions.setRsvpStatus).toHaveBeenCalledWith('ev-1', 'not_going', expect.anything())
  })

  it('still offers Maybe and Can’t go, which is real information for the host', () => {
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={vi.fn()} />
        <TicketedRsvpControls {...BASE} holdsTicket={false} />
      </JoinIntentProvider>,
    )
    expect(el.textContent).toContain('Maybe')
    expect(el.textContent).toContain('Can’t go')
  })

  it('never relabels Going as a waitlist on a ticketed event', () => {
    // `isFull` measures events.capacity. On a ticketed event the number that decides whether a seat
    // is left is the tier's quantity, and the press opens checkout rather than a queue. Offering a
    // waitlist here would be the wrong door AND the wrong number.
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={vi.fn()} />
        <TicketedRsvpControls {...BASE} holdsTicket={false} isFull />
      </JoinIntentProvider>,
    )
    expect(el.textContent).not.toContain('Join waitlist')
    expect(goingButton(el)!.textContent).toContain('Going')
  })

  it('does NOT offer Going when the booking window is shut and no door can take the press', () => {
    // `setRsvpStatus` returns without writing for `going` outside the window, so a segment shown
    // here would read as saved and have recorded nothing — SCAN-557's failure.
    const el = mount(
      <JoinIntentProvider>
        <TicketedRsvpControls {...BASE} holdsTicket={false} rsvpWindowOpen={false} />
      </JoinIntentProvider>,
    )
    expect(goingButton(el)).toBeNull()
    // The rest of the switch stays answerable: closing RSVPs stops new answers, it does not remove
    // a member's ability to decline.
    expect(el.textContent).toContain('Can’t go')
  })

  it('DOES offer Going outside the window when a door can take the press', () => {
    // The booking window governs the RSVP action, which the intercept never reaches. A ticket's own
    // on-sale window is a different setting, enforced by the tickets cascade above this control.
    const open = vi.fn()
    const el = mount(
      <JoinIntentProvider>
        <FakeTicketDoor onOpen={open} />
        <TicketedRsvpControls {...BASE} holdsTicket={false} rsvpWindowOpen={false} />
      </JoinIntentProvider>,
    )
    expect(goingButton(el)).not.toBeNull()
    act(() => goingButton(el)!.click())
    expect(open).toHaveBeenCalledTimes(1)
  })
})
