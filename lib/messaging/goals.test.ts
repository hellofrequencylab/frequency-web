import { describe, it, expect } from 'vitest'
import { MESSAGING_GOALS, getMessagingGoal } from './goals'

// Lock the guided-setup catalog: every goal maps to a real object, funnels carry a
// best-practice outline of 3 to 6 steps (the plan's welcome/nurture rule), and no copy
// uses an em or en dash (CONTENT-VOICE §10, brand copy has none).
describe('messaging goals', () => {
  it('every goal has a key, label, object, and suggested name', () => {
    for (const g of MESSAGING_GOALS) {
      expect(g.key).toBeTruthy()
      expect(g.label).toBeTruthy()
      expect(g.suggestedName).toBeTruthy()
      expect(g.object === 'campaign' || g.object === 'funnel').toBe(true)
      expect(g.tips.length).toBeGreaterThan(0)
    }
  })

  it('funnel goals ship a 3 to 6 step best-practice outline and a goal event', () => {
    for (const g of MESSAGING_GOALS.filter((x) => x.object === 'funnel')) {
      expect(g.outline).toBeDefined()
      expect(g.outline!.length).toBeGreaterThanOrEqual(3)
      expect(g.outline!.length).toBeLessThanOrEqual(6)
      expect(g.goalEvent).toBeTruthy()
    }
  })

  it('campaign goals do not carry a funnel outline', () => {
    for (const g of MESSAGING_GOALS.filter((x) => x.object === 'campaign')) {
      expect(g.outline).toBeUndefined()
    }
  })

  it('keys are unique and getMessagingGoal resolves them', () => {
    const keys = new Set(MESSAGING_GOALS.map((g) => g.key))
    expect(keys.size).toBe(MESSAGING_GOALS.length)
    for (const g of MESSAGING_GOALS) expect(getMessagingGoal(g.key)).toBe(g)
    expect(getMessagingGoal('does-not-exist')).toBeNull()
  })

  it('no brand copy uses em or en dashes', () => {
    for (const g of MESSAGING_GOALS) {
      const strings = [g.label, g.blurb, g.suggestedName, ...g.tips, ...(g.outline ?? []).flatMap((s) => [s.title, s.timing, s.note])]
      for (const s of strings) {
        expect(s).not.toMatch(/[—–]/)
      }
    }
  })
})
