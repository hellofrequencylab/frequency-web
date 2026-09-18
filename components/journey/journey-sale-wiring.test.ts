// WAVE 0 REGRESSIONS, PINNED. Every case here is a defect that shipped, and each one was invisible
// to typecheck: an optional prop nobody passed, a literal that looked like a fallback, a label that
// hardcoded the unit it was counting in. A test that renders is not what catches those -- the bugs
// were in the WIRING between a component and its one caller -- so most of this reads SOURCE, the
// same idiom as components/billing/onpage-callers.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { phaseOpenLabel, cadenceLabel } from './discovery-widgets'

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), 'utf8')

/** Source with comments removed, the idiom components/billing/onpage-callers.test.ts uses: these
 *  assertions are about what the code DOES, and a comment explaining the defect it fixed would
 *  otherwise read as the defect still being present. That is not hypothetical -- the notes added
 *  beside these very fixes quote the old `enrolledCount={0}` and the old `<h2>Questions</h2>`. */
const code = (...p: string[]) =>
  read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

describe('a phase is labelled in the unit its cadence is counted in', () => {
  // The defect: `Week ${i + 1}`, hardcoded, printed directly under a chip reading "1 phase / day"
  // or "1 phase / 2 weeks". Phase 0 is always "Unlocks at start", so these start at index 1.
  it('counts weeks on a weekly drip', () => {
    expect(phaseOpenLabel(1, 7)).toBe('Week 2')
    expect(phaseOpenLabel(3, 7)).toBe('Week 4')
  })

  it('counts days on a daily drip', () => {
    expect(phaseOpenLabel(1, 1)).toBe('Day 2')
  })

  it('counts REAL weeks on a fortnightly drip, not phase ordinals', () => {
    // The bug in one line: phase 4 of a fortnightly Journey opens in week 7, and read "Week 4".
    expect(phaseOpenLabel(3, 14)).toBe('Week 7')
    expect(cadenceLabel(14)).toBe('1 phase / 2 weeks')
  })

  it('falls back to days for a cadence that is not a whole number of weeks', () => {
    expect(phaseOpenLabel(2, 10)).toBe('Day 21')
  })

  it('treats a missing cadence as weekly, which is what the hardcoded label assumed', () => {
    expect(phaseOpenLabel(1, 0)).toBe('Week 2')
  })
})

describe('the sticky rail card knows what enrolling costs', () => {
  const src = read('components', 'journey', 'discovery-widgets.tsx')

  it('AtAGlanceCard accepts an offer and hands it to its EnrollCta', () => {
    // The defect: the card took no `offer` at all, so on a $444 Journey the rail rendered the FREE
    // door's "Start Journey" submit beside a hero reading "Get access". checkFreeEnrol refused the
    // POST and returned nothing the member could see, so the button simply read as broken.
    const card = src.slice(src.indexOf('export function AtAGlanceCard'))
    expect(card).toMatch(/offer\?:\s*\{[^}]*priceLabel/)
    expect(card).toMatch(/offer=\{offer\}/)
  })

  it('the Journey page passes its resolved offer into that card', () => {
    const page = read('app', '(main)', 'journeys', '[slug]', 'page.tsx')
    const call = page.slice(page.indexOf('<AtAGlanceCard'))
    expect(call.slice(0, call.indexOf('/>'))).toContain('offer={offer}')
  })
})

describe('the buy control does not dead-end a buyer', () => {
  const src = read('app', '(main)', 'marketplace', 'buy-button.tsx')

  it('routes a signed-out buyer to sign-in carrying a return path', () => {
    // The defect: `'Sign in to buy.'` printed under the button and nothing else. On a paid Journey
    // that sentence was the entire signed-out path.
    expect(src).toContain('res.signInRequired')
    expect(src).toMatch(/\/sign-in\?next=\$\{encodeURIComponent\(back\)\}/)
  })

  it('settles the order from its own success handler, not the webhook alone', () => {
    // The defect: confirm({ redirect: 'if_required' }) never navigates, so the success URL's
    // reconcile never runs. Without onPaid the webhook was the only thing that could grant a
    // Journey enrolment behind a panel that had already said the buyer was in.
    expect(src).toContain('settleCommerceOrderAction')
    expect(src).toMatch(/onPaid=\{sessionId \?/)
  })

  it('still passes forceHosted on the fallback, which is load-bearing', () => {
    expect(src).toContain('forceHosted: true')
  })
})

describe('the action layer carries what the control needs', () => {
  const src = read('app', '(main)', 'marketplace', 'commerce-actions.ts')

  it('hands back the session id alongside the client secret', () => {
    expect(src).toMatch(/clientSecret: r\.clientSecret, sessionId: r\.sessionId/)
  })

  it('flags the signed-out case rather than only naming it', () => {
    expect(src).toContain('signInRequired: true')
  })

  it('fails the settle OPEN on an unwired limiter, because it runs after a charge', () => {
    expect(src).toMatch(/settle_commerce_order[^)]*whenUnconfigured: 'allow'/s)
  })
})

describe('the sales page does not print the same thing twice', () => {
  it('the Q&A composer does not reuse the FAQ heading', () => {
    // Both read "Questions", one screen apart, on every Journey sales page.
    const qna = code('components', 'marketplace', 'listing-qna.tsx')
    expect(qna).toContain('Ask a question')
    expect(qna).not.toMatch(/<h2[^>]*>\s*\n?\s*Questions/)
  })

  it('a Journey suppresses the solo gallery row that would repeat its cover', () => {
    const page = read('app', '(main)', 'market', '[id]', 'page.tsx')
    expect(page).toContain('soloGalleryRow={!journeyPlan}')
  })

  it('the enrolled count is derived, never the literal zero it used to be', () => {
    const body = code('components', 'marketplace', 'journey-sales-body.tsx')
    expect(body).not.toContain('enrolledCount={0}')
    expect(body).toContain('enrolledCount={offer?.enrolled ?? 0}')
  })
})

describe('the trust line survives a listing with no contact module', () => {
  it('renders contactNote when the contact section is absent', () => {
    // A Space-owned listing has a null sellerProfileId, so showContact is false and the section
    // carrying "Checkout is secure on Stripe" plus the Report control never rendered at all.
    const tpl = read('components', 'templates', 'listing-detail-template.tsx')
    expect(tpl).toContain('{!showContact && !claimToken && contactNote && (')
  })
})
