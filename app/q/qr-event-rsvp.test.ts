import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// SOURCE-SHAPE guard for the event branch of the QR door (ADR-1176).
//
// THE DEFECT. Scanning a printed event code INSERTED an RSVP straight through the admin client:
//
//     await admin.from('event_rsvps')
//       .insert({ event_id: code.event_id, profile_id: profileId, status: 'going' })
//
// which bypassed every rule the RSVP actions enforce. A cancelled or long-finished event took a
// seat. The host's booking window was ignored. And `approval_status` fell to its column default of
// 'none' (verified in the live schema), so a scan walked past an approval-gated event's queue and
// landed as an ADMITTED guest rather than a request. It also skipped the confirmation email, the
// activity-feed line and the gems, so a scanned RSVP was a second-class row wherever the two were
// compared.
//
// The fix is not another copy of the rules: it is calling the one function that already has them.
// This file pins that, because the tempting "small" change here is always another direct write.

const ROUTE = readFileSync(path.join(process.cwd(), 'app/q/[slug]/route.ts'), 'utf8')

describe('the QR door RSVPs through the governed action', () => {
  it('calls setRsvpStatus rather than writing event_rsvps itself', () => {
    expect(ROUTE).toMatch(/await setRsvpStatus\(code\.event_id, 'going'\)/)
    expect(ROUTE).toMatch(/import \{ checkInEvent, setRsvpStatus \}/)
  })

  it('never touches event_rsvps directly — that is the whole bug class', () => {
    // Any read or write of the table from this route is a path around the gates, whether or not
    // the author remembered the approval column this time.
    expect(ROUTE).not.toMatch(/event_rsvps/)
  })

  it('still runs the check-in after the RSVP, in that order', () => {
    const rsvpIdx = ROUTE.indexOf("setRsvpStatus(code.event_id, 'going')")
    const checkIdx = ROUTE.indexOf('checkInEvent(code.event_id)')
    expect(rsvpIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeGreaterThan(rsvpIdx)
  })
})
