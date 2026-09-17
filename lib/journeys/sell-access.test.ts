import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveJourneyAccess } from './journey-access'

// ── canSell: "only paid spaces can create paid journeys" (owner ruling 2026-09-17, ADR-1397) ─────
//
// The matrix is the ruling. Every row here is a way somebody could otherwise have ended up able to
// take money for a Journey.

const JOURNEY = { planId: 'plan-1', authorId: 'author-1', spaceId: 'space-1' }

describe('resolveJourneyAccess canSell', () => {
  it('lets a paid-Space editor sell', () => {
    const a = resolveJourneyAccess(
      { profileId: 'author-1', space: { plan: 'business', canEdit: true } },
      JOURNEY,
    )
    expect(a.canSell).toBe(true)
  })

  it('lets a Collective-Space editor sell', () => {
    const a = resolveJourneyAccess(
      { profileId: 'author-1', space: { plan: 'collective', canEdit: true } },
      JOURNEY,
    )
    expect(a.canSell).toBe(true)
  })

  // The ruling's whole point.
  it('refuses a FREE Space, even to the author who can otherwise edit and publish', () => {
    const a = resolveJourneyAccess(
      { profileId: 'author-1', space: { plan: 'free', canEdit: true } },
      JOURNEY,
    )
    expect(a.canSell).toBe(false)
    expect(a.canEdit).toBe(true)
    expect(a.canPublish).toBe(true)
  })

  it('refuses somebody who cannot edit the paid Space, even though the Space could sell', () => {
    const a = resolveJourneyAccess(
      { profileId: 'stranger', space: { plan: 'business', canEdit: false } },
      JOURNEY,
    )
    expect(a.canSell).toBe(false)
  })

  // A PERSONAL Journey is never sellable at any member tier. Paying for Crew must not buy a till.
  it('refuses a personal Journey however paid the member is', () => {
    for (const tier of ['free', 'crew'] as const) {
      const a = resolveJourneyAccess(
        { profileId: 'author-1', tier, realTier: tier },
        { planId: 'plan-1', authorId: 'author-1', spaceId: null },
      )
      expect(a.canSell, `tier ${tier}`).toBe(false)
    }
  })

  it('refuses a signed-out viewer', () => {
    expect(resolveJourneyAccess({ profileId: null }, JOURNEY).canSell).toBe(false)
  })

  it('lets platform staff sell', () => {
    expect(resolveJourneyAccess({ profileId: 'op-1', webRole: 'janitor' }, JOURNEY).canSell).toBe(true)
  })

  // canSell is its own question: being able to run cohorts is not being able to charge for them.
  it('does not follow canEdit', () => {
    const a = resolveJourneyAccess(
      { profileId: 'author-1', space: { plan: 'free', canEdit: true } },
      JOURNEY,
    )
    expect(a.canEdit).toBe(true)
    expect(a.canSell).toBe(false)
  })
})

// ── The source-shape guard ───────────────────────────────────────────────────────────────────────
describe('checkJourneySell source shape', () => {
  const raw = readFileSync('lib/journeys/sell-gate.ts', 'utf8')
  // Measure the CODE, not the prose. The module's header explains at length why it does not honour
  // the beta grace, so a bare search for the name matches the explanation and passes by existing --
  // the shape-not-truth failure this repo has named in four ADRs. Strip comments first.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // 🔴 The rule that would quietly undo the ruling. checkJourneyPublish short-circuits to ok while
  // featureGatesLive() is false; if this gate ever grew the same line, every free Space could sell
  // for the whole beta and nothing would look broken.
  it('never short-circuits on the beta grace window', () => {
    expect(src).not.toMatch(/featureGatesLive/)
  })

  // The positive control for the stripper: the name IS in the file, in a comment. If this ever fails,
  // the comment moved and the guard above has stopped measuring anything.
  it('strips comments rather than passing because the file is silent', () => {
    expect(raw).toMatch(/featureGatesLive/)
    expect(src.length).toBeLessThan(raw.length)
  })

  it('composes the one resolver rather than laddering plans itself', () => {
    expect(src).toMatch(/resolveJourneyAccess/)
    expect(src).toMatch(/access\.canSell/)
  })

  it('fails closed on a missing plan, Space or caller', () => {
    expect(src).toMatch(/if \(!callerId\) return \{ ok: false/)
    expect(src).toMatch(/if \(!row\) return \{ ok: false/)
    expect(src).toMatch(/if \(!space\) return \{ ok: false/)
    expect(src).toMatch(/if \(!spaceId\) return \{ ok: false/)
  })

  it('normalizes the root space to personal before deciding', () => {
    expect(src).toMatch(/loadRootSpaceId/)
  })
})
