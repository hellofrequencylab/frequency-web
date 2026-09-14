import { describe, it, expect } from 'vitest'
import { sourceWithoutComments } from '@/test/source-shape'
import { deriveTicketOwnership } from './ticket-ownership'
import { isAdmitted } from './admission'

// A `?ticket=success&session_id=` URL used to set ownsTicket for ANY reader, and ownsTicket unhides
// a hidden venue. The rule (ADR-854, one gate over): a URL is a claim, so it may confirm a message
// and never grant a capability. The composition below is the page's own `addressHidden` line, so
// the signed-out case is measured on its CONSEQUENCE — the address — not on a flag.

/** The page's gate, verbatim in shape: a hidden-venue event, a viewer with no RSVP row, not a
 *  manager. Returns whether the street and pin stay hidden from this viewer. */
const addressHiddenFor = (o: { ownsTicket: boolean }, opts: { canManage?: boolean } = {}) => {
  const hideAddress = true
  const canManage = opts.canManage ?? false
  // app/(main)/events/[slug]/page.tsx:
  //   viewerRegistered = isAdmitted({ status: myRsvpStatus, approval_status: myApprovalStatus }) || ownsTicket
  //   addressHidden = extra?.hide_address === true && !canManage && !viewerRegistered
  const viewerRegistered = isAdmitted({ status: null, approval_status: null }) || o.ownsTicket
  return hideAddress && !canManage && !viewerRegistered
}

describe('deriveTicketOwnership', () => {
  it('🔴 a signed-out reader with a valid session id gets the message, never the venue', () => {
    const o = deriveTicketOwnership({ viewerProfileId: null, holdsTicketRow: false, reconciledCents: 2500 })
    expect(o.purchaseConfirmed).toBe(true)
    expect(o.ownsTicket).toBe(false)
    expect(addressHiddenFor(o)).toBe(true)
  })

  it('a signed-out reader is never an owner, whatever the row lookup says', () => {
    // hasTicket is never called without a profile; a true here is a caller mistake, not a seat.
    const o = deriveTicketOwnership({ viewerProfileId: null, holdsTicketRow: true, reconciledCents: null })
    expect(o.ownsTicket).toBe(false)
    expect(o.purchaseConfirmed).toBe(false)
    expect(addressHiddenFor(o)).toBe(true)
  })

  it('a signed-in owner sees the venue, with or without the redirect', () => {
    for (const reconciledCents of [null, 2500]) {
      const o = deriveTicketOwnership({ viewerProfileId: 'p1', holdsTicketRow: true, reconciledCents })
      expect(o.ownsTicket).toBe(true)
      expect(addressHiddenFor(o)).toBe(false)
    }
  })

  it('a signed-in reader who opened someone else’s receipt link is confirmed, not registered', () => {
    // The row lookup is for THEIR profile; the session belongs to another buyer. Message only.
    const o = deriveTicketOwnership({ viewerProfileId: 'p2', holdsTicketRow: false, reconciledCents: 2500 })
    expect(o.purchaseConfirmed).toBe(true)
    expect(o.ownsTicket).toBe(false)
    expect(addressHiddenFor(o)).toBe(true)
  })

  it('a manager keeps the venue regardless (the gate’s other exit, unchanged)', () => {
    const o = deriveTicketOwnership({ viewerProfileId: null, holdsTicketRow: false, reconciledCents: null })
    expect(addressHiddenFor(o, { canManage: true })).toBe(false)
  })
})

// ── The event page actually ASKS ───────────────────────────────────────────────────────────────

describe('the event page derives ownership through the helper', () => {
  it('the URL-derived promotion is gone and the helper is the derivation', () => {
    // Comment- and import-free (LIVE-167): the call is the needle, never the import line.
    const PAGE = sourceWithoutComments('app/(main)/events/[slug]/page.tsx', { imports: true })
    // The defect, by its exact shape, and by any shape that assigns ownership from a literal.
    expect(PAGE).not.toMatch(/if \(ticketedCents !== null\) ownsTicket = true/)
    expect(PAGE).not.toMatch(/ownsTicket = true/)
    expect(PAGE).toContain('deriveTicketOwnership({')
    expect(PAGE).toContain('reconciledCents: ticketedCents')
    // The venue gate reads ownsTicket alone — purchaseConfirmed must never join it.
    expect(PAGE).toContain(
      'const viewerRegistered = isAdmitted({ status: myRsvpStatus, approval_status: myApprovalStatus }) || ownsTicket'
    )
    expect(PAGE).not.toMatch(/viewerRegistered[^\n]*purchaseConfirmed/)
  })
})
