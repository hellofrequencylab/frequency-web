import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE PUBLIC CLAIM CTA MUST STAY MOUNTED.
//
// `requestClaimLink` (claim-actions.ts) shipped in July 2026 with a header saying it powers the
// public "Is this your event? Claim it" CTA. Its only caller, components/events/claim-event-banner,
// was deleted on 2026-07-13 (#1751) and the action was left behind: it compiled, it typechecked,
// and no user could ever reach it. An orphaned server action is invisible to tsc, eslint and the
// unit suite by construction, so the only thing that catches it is a test asserting the import
// graph reaches a real route (same shape as components/events/discovery-wiring.test.ts).
//
// Every assertion here FAILS on the pre-mount tree: before this mount the page contained no
// ClaimRequestCta, no `isClaimable`, and claim-request-cta.tsx did not exist.

const PAGE = 'app/(main)/events/[slug]/page.tsx'
const CARD = 'app/(main)/events/[slug]/claim-request-cta.tsx'
const ACTION = 'app/(main)/events/[slug]/claim-actions.ts'
const STORE = 'lib/events/event-drafts.ts'

const page = readFileSync(PAGE, 'utf8')
const card = readFileSync(CARD, 'utf8')

describe('requestClaimLink is reachable from the event detail page', () => {
  it('the card imports the action', () => {
    expect(card, 'the claim CTA no longer calls requestClaimLink').toContain('requestClaimLink')
  })

  it('the event detail page mounts the card', () => {
    expect(page).toContain("from './claim-request-cta'")
    expect(page, 'requestClaimLink is orphaned again').toContain('<ClaimRequestCta')
  })

  it('the client boundary is the leaf, not the page', () => {
    expect(card.startsWith("'use client'")).toBe(true)
    // The page is a Server Component and must stay one (PAGE-FRAMEWORK §5).
    expect(page.slice(0, 200)).not.toContain("'use client'")
  })
})

describe('the CTA only appears for an event the action would actually serve', () => {
  it('the page derives claimability instead of inventing a rule', () => {
    expect(page).toContain('const isClaimable =')
    // The four terms of resendClaimInvite's guard, expressed in the page's own values.
    expect(page).toMatch(/isClaimable\s*=\s*\n?\s*isUnclaimedPosted/)
    expect(page).toContain('!!extra?.claim_token')
    expect(page).toContain("(extra?.status ?? 'published') === 'published'")
  })

  it('isUnclaimedPosted still carries the host_id / claimed_at / Space-host halves', () => {
    expect(page).toContain(
      'const isUnclaimedPosted = isPostedEvent && !extra?.claimed_at && !event.host && !spaceHost',
    )
  })

  it('the server guard it mirrors has not moved', () => {
    const store = readFileSync(STORE, 'utf8')
    expect(store).toContain("if (!ev || ev.status !== 'published') return { ok: false, error: 'not_found' }")
    expect(store).toContain("if (ev.host_id || ev.claimed_at) return { ok: false, error: 'already_claimed' }")
    expect(store).toContain("if (!ev.claim_token) return { ok: false, error: 'not_claimable' }")
  })

  it('anyone who can already manage the event does not see it', () => {
    expect(page).toContain('isClaimable && !canManage')
  })

  it('the token banner still wins when the URL carries a matching claim token', () => {
    // The two are one ternary in bodyLead: token branch first, request CTA as the fallback.
    const lead = page.slice(page.indexOf('bodyLead={'), page.indexOf('// Photo gallery'))
    expect(lead.indexOf('claim === extra.claim_token')).toBeLessThan(lead.indexOf('<ClaimRequestCta'))
  })
})

describe('the CTA never publishes the claim path', () => {
  it('the card is handed no token', () => {
    expect(card).not.toContain('claim_token')
    expect(card).not.toContain('token=')
    expect(page).not.toMatch(/<ClaimRequestCta[^>]*token/)
  })

  it('the action only ever resends to the contact on file', () => {
    const action = readFileSync(ACTION, 'utf8')
    // It takes an eventId and nothing that could name a destination address.
    expect(action).toContain('requestClaimLink(eventId: string)')
    expect(action).not.toMatch(/email\s*:|to\s*:/)
  })
})

describe('every empty and refusal case has copy', () => {
  for (const state of ['sign_in', 'no_email_on_file', 'already_claimed', 'unavailable'] as const) {
    it(`handles ${state}`, () => {
      expect(card).toContain(`'${state}'`)
    })
  }

  it('confirms the send', () => {
    expect(card).toContain("state === 'sent'")
  })

  it('the copy passes the mechanical half of CONTENT-VOICE §10', () => {
    // Copy lines only: the file's own comments are prose about the code, not brand copy.
    const copy = card
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
      .join('\n')
    expect(copy, 'no em dashes in brand copy').not.toContain('—')
    expect(copy, 'max one exclamation point per screen').not.toContain('!')
    // Sentence case, not Title Case Marketing Speak (the retired banner said "Claim This Event").
    expect(copy).not.toContain('Claim This Event')
  })
})
