import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isAdmitted, isPendingApproval } from './admission'

// The approval gate writes a pending request as status='going' + approval_status='pending', so
// `status === 'going'` alone is never a seat. Two readers that guard secrets — the hidden venue on
// the event page, and the check-in door — read `status` alone. Behaviour is pinned here; the fact
// that those two readers now CONSULT the rule is pinned below, source-shape, for the same reason
// rsvp-enforcement.test.ts pins its callers: the defect was a rule that existed and was not asked.

describe('isPendingApproval', () => {
  it('is true only for a seat still waiting on the host', () => {
    expect(isPendingApproval({ approval_status: 'pending' })).toBe(true)
    expect(isPendingApproval({ approval_status: 'none' })).toBe(false)
    expect(isPendingApproval({ approval_status: 'approved' })).toBe(false)
  })

  it('tolerates a partial select (null / undefined read as not pending)', () => {
    // approval_status is NOT NULL default 'none' on the table, so a missing value can only mean the
    // column was not selected — and a reader that forgot to select it must not be treated as pending
    // (that would lock every legacy caller out), it must be caught by the source-shape pins below.
    expect(isPendingApproval({ approval_status: null })).toBe(false)
    expect(isPendingApproval({})).toBe(false)
  })
})

describe('isAdmitted', () => {
  it('admits a going or waitlisted seat that is not waiting on the host', () => {
    expect(isAdmitted({ status: 'going', approval_status: 'none' })).toBe(true)
    expect(isAdmitted({ status: 'going', approval_status: 'approved' })).toBe(true)
    // Waitlist is queued on CAPACITY, not approval — through the host's gate, so "registered".
    expect(isAdmitted({ status: 'waitlist', approval_status: 'approved' })).toBe(true)
    expect(isAdmitted({ status: 'waitlist', approval_status: 'none' })).toBe(true)
  })

  it('🔴 never admits a PENDING request, whatever its status says', () => {
    // This is the defect: the row reads 'going' and the venue was disclosed on it.
    expect(isAdmitted({ status: 'going', approval_status: 'pending' })).toBe(false)
    expect(isAdmitted({ status: 'waitlist', approval_status: 'pending' })).toBe(false)
  })

  it('never admits maybe / not_going / no RSVP', () => {
    expect(isAdmitted({ status: 'maybe', approval_status: 'none' })).toBe(false)
    expect(isAdmitted({ status: 'not_going', approval_status: 'none' })).toBe(false)
    expect(isAdmitted({ status: null, approval_status: null })).toBe(false)
    expect(isAdmitted({})).toBe(false)
  })
})

// ── The two readers that guard secrets actually ASK ────────────────────────────────────────────

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('the venue disclosure and the check-in door consult the rule', () => {
  it('the event page decides "registered" through isAdmitted, with BOTH columns', () => {
    const PAGE = read('app/(main)/events/[slug]/page.tsx')
    expect(PAGE).toContain("from '@/lib/events/admission'")
    // Both halves passed, by name. A future edit that drops approval_status from this call is the
    // regression this pins — it is exactly the shape the original read had.
    expect(PAGE).toContain('isAdmitted({ status: myRsvpStatus, approval_status: myApprovalStatus })')
    // And the old read is gone — not merely joined by a second condition somewhere else.
    expect(PAGE).not.toMatch(/viewerRegistered = myRsvpStatus === 'going'/)
  })

  it('checkInEvent selects approval_status and refuses a pending seat', () => {
    const ACTIONS = read('app/(main)/events/actions.ts')
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function checkInEvent('))
    expect(fn).toContain(".select('status, approval_status')")
    expect(fn).toContain('isPendingApproval(rsvp)')
    // The bare `select('status')` on the RSVP row is what let a pending requester check in.
    expect(fn).not.toContain(".select('status')\n")
  })
})
