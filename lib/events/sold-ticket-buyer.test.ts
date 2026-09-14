import { describe, it, expect } from 'vitest'
import { soldTicketBuyer } from './sold-ticket-buyer'

// THE HOST CAN SEE WHO A GUEST BUYER IS (LIVE-319). Before this, the Sales module printed
// `display_name ?? 'A member'` for every null buyer, so a guest who paid under an address was
// indistinguishable from a deleted account, and the host could not refund, contact or door-check
// them from the product. These pin the three readings apart.

describe('soldTicketBuyer', () => {
  it('names a member by display name', () => {
    expect(soldTicketBuyer({ buyer: { display_name: 'Ada Lovelace', handle: 'ada' }, guestEmail: null }))
      .toEqual({ kind: 'member', label: 'Ada Lovelace' })
  })

  it('falls to the handle, then the member label, for a member with no display name', () => {
    expect(soldTicketBuyer({ buyer: { display_name: '  ', handle: 'ada' }, guestEmail: null }))
      .toEqual({ kind: 'member', label: '@ada' })
    expect(soldTicketBuyer({ buyer: { display_name: null, handle: null }, guestEmail: null }))
      .toEqual({ kind: 'member', label: 'A member' })
  })

  it('shows a guest buyer as the address they paid under', () => {
    expect(soldTicketBuyer({ buyer: null, guestEmail: 'ada@example.com' }))
      .toEqual({ kind: 'guest', label: 'ada@example.com' })
  })

  it('never lets a guest address override a real profile', () => {
    // A claimed guest ticket keeps guest_email beside a now-set buyer_profile_id (LIVE-317); the
    // member owns the row, so the name wins.
    expect(soldTicketBuyer({ buyer: { display_name: 'Ada', handle: 'ada' }, guestEmail: 'ada@example.com' }))
      .toEqual({ kind: 'member', label: 'Ada' })
  })

  it('keeps a deleted-account buyer distinguishable from a guest and from a member', () => {
    const gone = soldTicketBuyer({ buyer: null, guestEmail: null })
    expect(gone.kind).toBe('gone')
    expect(gone.label).not.toBe('A member')
    expect(gone.label).not.toMatch(/@/)
    // A blank address is no address; a row that carries '' still reads as gone.
    expect(soldTicketBuyer({ buyer: null, guestEmail: '   ' }).kind).toBe('gone')
    expect(soldTicketBuyer({ buyer: null, guestEmail: undefined }).kind).toBe('gone')
  })
})
