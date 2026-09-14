// WHO BOUGHT THIS TICKET (LIVE-319). One pure reading of a succeeded `event_tickets` row for the
// host Sales module, so the list never hides a guest behind a member's label.
//
// A ticket has three possible buyers, and the host needs to tell them apart before refunding,
// contacting, or door-checking anyone:
//
//   member  buyer_profile_id joins to a profile. Show the display name.
//   guest   buyer_profile_id is NULL and guest_email is set: the address a signed-out buyer paid
//           under (migration 20270345003400). The address IS the identity here, since it is the
//           only thing the row knows and the only way the host can reach them. Tickets carry no
//           guest name column, so there is no name to prefer over it.
//   gone    buyer_profile_id was set once and the profile is gone (deleted account), or a legacy
//           row predates the guest column: null buyer AND null guest_email. Still a real sale
//           the host can refund, so it stays on the list with an honest label rather than
//           borrowing "A member".

export type SoldTicketBuyerKind = 'member' | 'guest' | 'gone'

export interface SoldTicketBuyerInput {
  buyer: { display_name: string | null; handle: string | null } | null
  guestEmail: string | null | undefined
}

export interface SoldTicketBuyer {
  kind: SoldTicketBuyerKind
  /** what the row prints: a name, an address, or the fallback for a buyer nobody can name */
  label: string
}

/** Resolve the buyer line for one sold ticket. Pure, no I/O. */
export function soldTicketBuyer({ buyer, guestEmail }: SoldTicketBuyerInput): SoldTicketBuyer {
  if (buyer) {
    // The profile exists. A blank display name still belongs to a member, so fall to the handle
    // before the anonymous label, never to the guest branch.
    const name = buyer.display_name?.trim() || (buyer.handle ? `@${buyer.handle}` : '')
    return { kind: 'member', label: name || 'A member' }
  }
  const email = guestEmail?.trim()
  if (email) return { kind: 'guest', label: email }
  return { kind: 'gone', label: 'Buyer no longer on Frequency' }
}
