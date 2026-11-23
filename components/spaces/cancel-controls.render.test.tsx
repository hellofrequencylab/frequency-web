// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/spaces/booking-actions', () => ({ cancelBooking: vi.fn(), listOpenSlotsForService: vi.fn() }))
vi.mock('@/lib/spaces/enroll-actions', () => ({ cancelEnrollment: vi.fn() }))
vi.mock('@/lib/spaces/tickets-actions', () => ({ cancelRsvp: vi.fn() }))
vi.mock('@/components/spaces/booking-picker', () => ({ BookingPicker: () => null }))

import { BookingCancelButton } from './booking-cancel-button'
import { BookingMineList } from './booking-mine-list'
import { EnrollmentCancelButton } from './enroll/enrollment-cancel-button'
import { TicketRsvpCancelButton } from './tickets/ticket-rsvp-cancel-button'

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

const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')]
const byText = (el: HTMLElement, text: string) => buttons(el).find((b) => b.textContent?.trim() === text)!
const classes = (b: HTMLButtonElement) => b.className.split(/\s+/).sort().join(' ')

// Every control in a Space cancel flow is the kit Button at the member size, so "Keep" is as easy to
// tap as "Confirm". The quiet actions are the kit text button and the destructive one the danger outline.
const QUIET = 'btn sm txt'
const DANGER = 'btn mu-danger-o sm'

describe('Space cancel controls use the kit Button', () => {
  const cases: [string, React.ReactNode, string][] = [
    ['booking', <BookingCancelButton key="b" bookingId="b1" />, 'Cancel'],
    ['enrollment', <EnrollmentCancelButton key="e" enrollmentId="e1" />, 'Remove'],
    ['enrollment (member)', <EnrollmentCancelButton key="m" enrollmentId="e1" label="Cancel enrollment" align="center" />, 'Cancel enrollment'],
    ['ticket RSVP', <TicketRsvpCancelButton key="t" rsvpId="r1" />, 'Cancel RSVP'],
  ]

  it.each(cases)('%s: resting, then Confirm and Keep', (_name, node, label) => {
    const el = mount(node)
    const resting = byText(el, label)
    expect(classes(resting)).toBe(QUIET)
    expect(resting.type).toBe('button')

    act(() => resting.click())
    expect(classes(byText(el, 'Confirm'))).toBe(DANGER)
    expect(classes(byText(el, 'Keep'))).toBe(QUIET)
    for (const b of buttons(el)) expect(b.type).toBe('button')

    act(() => byText(el, 'Keep').click())
    expect(byText(el, label)).toBeTruthy()
  })

  it('my bookings: Reschedule, Cancel, then Cancel booking and Keep', () => {
    const el = mount(
      <BookingMineList
        spaceId="s1"
        timezone="America/Los_Angeles"
        bookings={[
          { id: 'b1', startsAt: '2026-12-01T18:00:00Z', endsAt: '2026-12-01T19:00:00Z', note: null, serviceTypeId: null, serviceName: 'Breathwork', canModify: true },
        ]}
      />,
    )
    expect(classes(byText(el, 'Reschedule'))).toBe('btn sm')
    expect(classes(byText(el, 'Cancel'))).toBe(QUIET)

    act(() => byText(el, 'Cancel').click())
    expect(classes(byText(el, 'Cancel booking'))).toBe(DANGER)
    expect(classes(byText(el, 'Keep'))).toBe(QUIET)
    for (const b of buttons(el)) expect(b.type).toBe('button')
  })
})
