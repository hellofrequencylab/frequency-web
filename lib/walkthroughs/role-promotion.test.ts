import { describe, it, expect } from 'vitest'
import {
  promotionStepsCrossed,
  selectPendingPromotionTour,
  rolePromotionWalkthrough,
  allRolePromotionWalkthroughs,
  ROLE_PROMOTION_SLUG,
} from './role-promotion'

const NOW = new Date('2026-06-14T12:00:00.000Z').toISOString()

describe('promotionStepsCrossed', () => {
  it('member → host unlocks the host tour', () => {
    expect(promotionStepsCrossed('member', 'host')).toEqual(['host'])
  })

  it('host → guide unlocks the guide tour', () => {
    expect(promotionStepsCrossed('host', 'guide')).toEqual(['guide'])
  })

  it('guide → mentor unlocks the mentor tour', () => {
    expect(promotionStepsCrossed('guide', 'mentor')).toEqual(['mentor'])
  })

  it('a multi-rung jump unlocks each crossed tour, lowest first', () => {
    expect(promotionStepsCrossed('member', 'mentor')).toEqual(['host', 'guide', 'mentor'])
    expect(promotionStepsCrossed('member', 'guide')).toEqual(['host', 'guide'])
  })

  it('a null prior role (fresh grant) crosses from the bottom', () => {
    expect(promotionStepsCrossed(null, 'host')).toEqual(['host'])
    expect(promotionStepsCrossed(undefined, 'guide')).toEqual(['host', 'guide'])
  })

  it('no change unlocks nothing', () => {
    expect(promotionStepsCrossed('host', 'host')).toEqual([])
  })

  it('a demotion unlocks nothing', () => {
    expect(promotionStepsCrossed('mentor', 'host')).toEqual([])
    expect(promotionStepsCrossed('guide', 'member')).toEqual([])
  })

  it('the deprecated crew rung carries no tour (member → crew is a no-op)', () => {
    expect(promotionStepsCrossed('member', 'crew')).toEqual([])
  })

  it('staff rungs above mentor cross only the tours that exist', () => {
    expect(promotionStepsCrossed('mentor', 'admin')).toEqual([])
    expect(promotionStepsCrossed('member', 'admin')).toEqual(['host', 'guide', 'mentor'])
  })
})

describe('selectPendingPromotionTour', () => {
  it('returns null when nothing is pending', () => {
    expect(selectPendingPromotionTour('host', {})).toBeNull()
    expect(selectPendingPromotionTour('host', { [ROLE_PROMOTION_SLUG.host]: {} })).toBeNull()
  })

  it('surfaces a pending tour for the held rung', () => {
    const tour = selectPendingPromotionTour('host', {
      [ROLE_PROMOTION_SLUG.host]: { pendingAt: NOW },
    })
    expect(tour?.slug).toBe(ROLE_PROMOTION_SLUG.host)
  })

  it('skips a completed or dismissed tour', () => {
    expect(
      selectPendingPromotionTour('host', { [ROLE_PROMOTION_SLUG.host]: { pendingAt: NOW, completedAt: NOW } }),
    ).toBeNull()
    expect(
      selectPendingPromotionTour('host', { [ROLE_PROMOTION_SLUG.host]: { pendingAt: NOW, dismissedAt: NOW } }),
    ).toBeNull()
  })

  it('picks the highest-rung pending tour when several are pending', () => {
    const tour = selectPendingPromotionTour('mentor', {
      [ROLE_PROMOTION_SLUG.host]: { pendingAt: NOW },
      [ROLE_PROMOTION_SLUG.guide]: { pendingAt: NOW },
      [ROLE_PROMOTION_SLUG.mentor]: { pendingAt: NOW },
    })
    expect(tour?.slug).toBe(ROLE_PROMOTION_SLUG.mentor)
  })

  it('never surfaces a tour for a rung the member no longer holds', () => {
    // Pending guide tour but the member is only a host now → don't show the guide tour.
    const tour = selectPendingPromotionTour('host', {
      [ROLE_PROMOTION_SLUG.guide]: { pendingAt: NOW },
      [ROLE_PROMOTION_SLUG.host]: { pendingAt: NOW },
    })
    expect(tour?.slug).toBe(ROLE_PROMOTION_SLUG.host)
  })

  it('handles a null role gracefully (no tour)', () => {
    expect(selectPendingPromotionTour(null, { [ROLE_PROMOTION_SLUG.host]: { pendingAt: NOW } })).toBeNull()
  })
})

describe('rolePromotionWalkthrough shape', () => {
  it('every tour has a stable slug, an until_done cadence, slides, and the right trigger', () => {
    for (const t of allRolePromotionWalkthroughs()) {
      expect(t.slug).toMatch(/^role-promotion-(host|guide|mentor)$/)
      expect(t.active).toBe(true)
      expect(t.cadence).toBe('until_done')
      expect(t.steps.length).toBeGreaterThan(0)
      // Every slide carries an accent + layout (so the shared renderer never falls back).
      for (const s of t.steps) {
        expect(s.accent).toBeTruthy()
        expect(s.layout).toBeTruthy()
        expect(s.title).toBeTruthy()
      }
    }
    expect(rolePromotionWalkthrough('host').trigger).toBe('role_host')
    expect(rolePromotionWalkthrough('guide').trigger).toBe('role_guide')
    expect(rolePromotionWalkthrough('mentor').trigger).toBe('role_mentor')
  })

  it('no slide copy uses an em dash (brand voice rule)', () => {
    for (const t of allRolePromotionWalkthroughs()) {
      for (const s of t.steps) {
        expect(s.title).not.toContain('—')
        expect(s.body).not.toContain('—')
      }
    }
  })
})
