import { describe, it, expect } from 'vitest'
import { decideAmplitudeCelebration } from './amplitude-celebration'

describe('decideAmplitudeCelebration', () => {
  it('returns null when nothing new', () => {
    expect(decideAmplitudeCelebration(0, 0)).toBeNull()
    expect(decideAmplitudeCelebration(99, 0)).toBeNull() // still level 0
    expect(decideAmplitudeCelebration(150, 1)).toBeNull() // level 1 already seen
  })

  it('fires on a level-up with no milestone', () => {
    const c = decideAmplitudeCelebration(150, 0) // level 1
    expect(c).toMatchObject({ level: 1, amplitude: 150, milestoneLabel: null })
  })

  it('takes the gold treatment when a milestone was crossed', () => {
    const c = decideAmplitudeCelebration(1_050, 3) // level 4, crossed 1k
    expect(c).toMatchObject({ level: 4, milestoneLabel: 'First Thousand' })
  })

  it('celebrates the highest milestone when several were crossed at once', () => {
    const c = decideAmplitudeCelebration(5_600, 0) // backfill jump past 1k + 5k
    expect(c?.milestoneLabel).toBe('Five K')
  })

  it('does not re-fire a milestone already celebrated', () => {
    // 1k = level 4. Seen level 4, climb to level 5 (1500): plain level-up.
    const c = decideAmplitudeCelebration(1_500, 4)
    expect(c).toMatchObject({ level: 5, milestoneLabel: null })
  })
})
