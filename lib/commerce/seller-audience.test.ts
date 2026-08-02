import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── "Once you have your contact, Frequency doesn't take a cut" (ADR-913) ────────────────────
//
// This is the promise the whole pricing model rests on, so the failure modes are all financial and
// all silent. Getting it wrong does not throw — it either charges a member a fee we promised not to,
// or it hands away revenue on a customer Frequency genuinely sourced.
//
// The IO here is six indexed lookups against live tables, so these are SOURCE guards on the rules
// rather than a mocked round trip: what matters is which signals count, which direction the failure
// path leans, and that every money path actually asks the question.

const AUDIENCE = readFileSync('lib/commerce/seller-audience.ts', 'utf8')
const SOURCE = readFileSync('lib/commerce/order-source.ts', 'utf8')

describe('every relationship that means "this person is already yours"', () => {
  it('counts a Space follower, member, and CRM contact', () => {
    expect(AUDIENCE).toContain("from('space_follows')")
    expect(AUDIENCE).toContain("eq('follower_profile_id', buyer)")
    expect(AUDIENCE).toContain("from('space_members')")
    expect(AUDIENCE).toContain("eq('status', 'active')") // a lapsed member is not a current audience
    expect(AUDIENCE).toContain("from('contacts')")
  })

  it("counts the seller's OWN contact list, not just a Space's", () => {
    // 🔴 Load-bearing for the tier we are asking people to upgrade TO. A Crew host runs events with
    // no Space at all; without this signal every sale they make is network-rated and the headline
    // promise ("your own people are free") is false for exactly that tier.
    expect(AUDIENCE).toContain("from('network_contacts')")
    expect(AUDIENCE).toContain("eq('owner_id', seller)")
  })

  it('counts a prior purchase, and only a SETTLED, un-refunded one', () => {
    // Someone who paid you before is unambiguously yours, whatever the CRM says. But a pending or
    // refunded checkout moved no money and proves no relationship.
    expect(AUDIENCE).toContain("not('succeeded_at', 'is', null)")
    expect(AUDIENCE).toContain("is('refunded_at', null)")
  })

  it('treats buying from yourself as your own audience', () => {
    expect(AUDIENCE).toContain("if (seller && seller === buyer) return OWN('self')")
  })
})

describe('the failure direction is always "their audience"', () => {
  it('a read failure returns own-audience, never a charge', () => {
    // 🔴 THE DIRECTION IS THE WHOLE POINT. Under-collecting on a database hiccup is recoverable;
    // charging a fee we publicly promised not to is not. `found()` returns null (a NON-answer) on
    // any error rather than false, so an error can never be read as "no relationship".
    expect(AUDIENCE).toContain('const DEGRADED: AudienceVerdict = { isOwnAudience: true, signal: null, degraded: true }')
    expect(AUDIENCE).toMatch(/if \(error\) return null/)
    expect(AUDIENCE).toContain('if (sawFailure) return DEGRADED')
  })

  it('a missing buyer or seller identity is not a network sale', () => {
    // We cannot prove Frequency introduced someone we cannot identify.
    expect(AUDIENCE).toContain('if (!buyer) return DEGRADED')
    expect(AUDIENCE).toContain('if (!space && !seller) return DEGRADED')
  })

  it('records WHICH signal decided, so a disputed fee can be explained', () => {
    // The reason cookie attribution could never survive a host asking "why did you charge me for
    // that sale?" — there was no answer. This one has a receipt.
    expect(AUDIENCE).toContain('signal: AudienceSignal | null')
    expect(SOURCE).toContain('`own:${verdict.signal}`')
  })
})

describe('the relationship check outranks every cookie', () => {
  it('runs BEFORE the entryPoint and referral branches', () => {
    // Order is the rule. If the cookie branches ran first, a discovery entry point would bill a host
    // for a sale to their own follower — the exact thing the promise forbids.
    const relationship = SOURCE.indexOf('buyerIsSellersAudience')
    const entryPoint = SOURCE.indexOf('return { source: \'network\', attributionRef: `ep:${opts.entryPoint}` }')
    const refCookie = SOURCE.indexOf('REF_COOKIE')
    expect(relationship).toBeGreaterThan(-1)
    expect(relationship).toBeLessThan(SOURCE.indexOf('const jar = await cookies()'))
    // The self-scan guard still comes first of all.
    expect(SOURCE.indexOf('const selfScan')).toBeLessThan(relationship)
    expect(entryPoint).toBeGreaterThan(-1)
    expect(refCookie).toBeGreaterThan(-1)
  })

  it('names the trade-off it accepts out loud', () => {
    // A third party referring an existing follower earns no network credit. That is a real cost and
    // a deliberate choice (the owner's rule is absolute); a future reader must not "fix" it blind.
    expect(SOURCE).toMatch(/referral-credit case is knowingly given up|no network credit/)
  })
})

describe('every money path asks the question', () => {
  const PATHS = [
    { file: 'lib/billing/tickets.ts', what: 'event tickets' },
    { file: 'lib/billing/space-membership-checkout.ts', what: 'space memberships' },
    { file: 'lib/commerce/checkout.ts', what: 'shop, services and bookings' },
  ]

  it.each(PATHS)('$what passes sellerSpaceId so the Space relationship counts', ({ file }) => {
    // Without sellerSpaceId the check can only see the OWNER's personal contacts, so a Space's own
    // followers and members would be billed as strangers — silently, and on the busiest path.
    const src = readFileSync(file, 'utf8')
    expect(src).toContain('classifyOrderSource(')
    expect(src).toMatch(/sellerSpaceId:/)
  })

  it('tips are exempt because they carry no fee at all', () => {
    // A tip has no order source to classify and never will: no listing, no discovery surface,
    // nothing for Frequency to have sourced. It must not gain a classifier by accident.
    const tips = readFileSync('lib/billing/tips.ts', 'utf8')
    expect(tips).toContain('const fee = 0')
    expect(tips).not.toContain('classifyOrderSource')
    expect(tips).not.toContain('platformFeeCents')
  })
})
