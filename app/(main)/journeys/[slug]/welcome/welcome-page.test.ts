import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// ── THE WELCOME IS THE LANDING, AND IT IS NOT A FORM (PROG-GD5) ──────────────────────────────────
//
// The page a Journey buyer lands on once the Journey is theirs. Source-shape, because what matters
// is the ORDER of two side effects and which doors the page opens, not a render tree:
//   · settle by Checkout Session id BEFORE re-running the claim, because the claim only attaches a
//     SETTLED order and the webhook races the magic-link round trip (the same pair the event page
//     runs for a ticket);
//   · the Journey card leads to the course (journeyLearnPath), never back to the till;
//   · the doors after it are the checklist's own open place-steps plus the host, so this cannot
//     become a second onboarding engine or a profile form;
//   · a viewer with nothing to welcome and no payment in flight goes to the Journey page, and one
//     whose payment is still settling is told so rather than shown a Buy button.
const PAGE = 'app/(main)/journeys/[slug]/welcome/page.tsx'
const raw = readFileSync(PAGE, 'utf8')
const page = sourceWithoutComments(PAGE, { imports: true })

describe('the welcome composes the kit and stays out of the index', () => {
  it('is a FocusTemplate, with the Journey as an EntityCard and a settling state as an EmptyState', () => {
    expect(page).toContain('<FocusTemplate')
    expect(page).toContain('<EntityCard')
    expect(page).toContain('<EmptyState')
    expect(raw).not.toContain("'use client'")
  })

  it('is dynamic and noindex: it is a receipt-shaped page keyed to a purchase', () => {
    expect(raw).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(raw).toMatch(/robots:\s*\{\s*index:\s*false/)
  })
})

describe('the two backstops run settle-then-claim', () => {
  it('🔴 settles the Stripe session before re-running the idempotent claim', () => {
    const settle = page.indexOf('recordCommerceOrderFromSessionId(sessionId)')
    const claim = page.indexOf('claimGuestOrdersOnSignIn(')
    expect(settle).toBeGreaterThan(-1)
    expect(claim).toBeGreaterThan(settle)
  })

  it('only trusts a session id shaped like a Checkout Session', () => {
    expect(page).toContain("session_id.startsWith('cs_')")
  })
})

describe('what it opens onto', () => {
  it('the Journey card and its button lead to the course, not the till', () => {
    expect(page).toContain('href={journeyLearnPath(slug)}')
    expect(page).not.toContain('journeyBuySignInPath')
  })

  it('the doors are the checklist\'s open place-steps (Circle, Event) plus the host', () => {
    expect(page).toContain('getOnboardingStatus(profileId)')
    expect(page).toMatch(/DOOR_STEPS = new Set<[^>]+>\(\['circle', 'event'\]\)/)
    expect(page).toContain('onboarding.todo.filter((s) => DOOR_STEPS.has(s.key))')
    expect(page).toContain('href={`/spaces/${space.slug}`}')
    expect(page).toContain('href={`/people/${author.handle}`}')
  })

  it('asks the viewer to fill nothing in: no form, no input, no action import', () => {
    expect(page).not.toMatch(/<form\b/)
    expect(page).not.toMatch(/<input\b/)
    expect(page).not.toMatch(/['"]use server['"]/)
  })
})

describe('nothing to welcome', () => {
  it('a viewer who is not enrolled and has no payment in flight is sent to the Journey page', () => {
    expect(page).toContain('if (!sessionId) redirect(journeyMemberPath(slug))')
  })

  it('a signed-out visitor is sent through the same door the receipt and Stripe use', () => {
    expect(page).toContain('if (!profileId) redirect(journeyWelcomeDoor(slug, { sessionId }))')
  })
})
