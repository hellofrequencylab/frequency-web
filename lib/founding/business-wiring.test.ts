import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// THE FOUNDING BUSINESS OFFER MUST STAY REACHABLE.
//
// createFoundingBusinessCheckout had zero callers, and the Stripe session it builds redirects to
// /spaces/<slug>/settings/billing/founding and .../founding/success — routes that did not exist. So
// the whole ADR-599/803 per-city cohort was unbuyable: no button, no link, no route, and a
// `founding_members` business row could never be created through checkout. Meanwhile the status doc
// described this file as the LIVE founding checkout whose go-live was "merge + re-sync".
//
// Two failure modes, both silent, both checked here: the seam losing its caller again, and the
// redirect targets drifting away from the routes that serve them. A checkout that redirects to a 404
// is not something tsc, eslint, or a unit test can see.

const BASE = 'app/(main)/spaces/[slug]/settings/billing/founding'
const CHECKOUT = readFileSync('lib/founding/business-checkout.ts', 'utf8')

describe('the founding Business offer is reachable', () => {
  it('the offer page and the success confirm both exist', () => {
    expect(existsSync(`${BASE}/page.tsx`), 'the founding offer page is missing').toBe(true)
    expect(existsSync(`${BASE}/success/page.tsx`), 'the founding success confirm is missing').toBe(true)
    expect(existsSync(`${BASE}/actions.ts`), 'the founding checkout action is missing').toBe(true)
  })

  it("the checkout's redirect targets match the routes that exist", () => {
    // Both URLs are built from the same literal segment; if either is renamed the route must move.
    expect(CHECKOUT).toContain('/settings/billing/founding/success?session_id=')
    expect(CHECKOUT).toContain('/settings/billing/founding`')
  })

  it('the checkout seam has a real caller', () => {
    const action = readFileSync(`${BASE}/actions.ts`, 'utf8')
    expect(action).toContain('createFoundingBusinessCheckout')
    // And the page renders the offer the action re-resolves, so the two cannot disagree.
    const page = readFileSync(`${BASE}/page.tsx`, 'utf8')
    expect(page).toContain('resolveFoundingBusinessOffer')
  })

  it('the action gates on the ADMIN billing floor, not canManage', () => {
    // Starting a subscription on the owner's card is not an editor-level action — the same reasoning
    // that moved the seat / portal / plan actions off canManage.
    const action = readFileSync(`${BASE}/actions.ts`, 'utf8')
    expect(action).toContain('caps.isAdmin')
    // Keyed on the capability READ, not the bare word — the rationale comment names canManage.
    expect(action).not.toContain('caps.canManage')
  })

  it('the offer is linked from the billing surface, not just addressable by URL', () => {
    const body = readFileSync('app/(main)/spaces/[slug]/settings/billing/billing-body.tsx', 'utf8')
    expect(body).toContain('/settings/billing/founding')
  })

  it('the success confirm grants the founder record from the session', () => {
    const success = readFileSync(`${BASE}/success/page.tsx`, 'utf8')
    expect(success).toContain('grantFoundingBusinessFromSessionId')
    // The confirm must verify the session is ours AND paid before granting.
    expect(CHECKOUT).toContain("md.founding !== 'business'")
    expect(CHECKOUT).toContain("session.payment_status !== 'paid'")
  })
})
