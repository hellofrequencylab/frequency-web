import { describe, it, expect } from 'vitest'
import { CREW_PERKS, isCrewTheme } from './perks'
import { PROFILE_SKINS } from '@/lib/theme/profile-skins'

// LIVE-757: the Crew perks registry. A perk is advertised only when something is behind it.

describe('Crew perks', () => {
  it('names themes, flair and early access, once each', () => {
    expect(CREW_PERKS.map((p) => p.key)).toEqual(['themes', 'flair', 'early_access'])
  })

  it('advertises no perk that has nothing behind it', () => {
    // No Crew theme is authored (Midnight is owner-held, lib/theme/skins.ts), and flair and early
    // access are not built, so nothing is live yet. Flip `live` in the same change that ships one.
    expect(CREW_PERKS.filter((p) => p.live)).toEqual([])
    expect(PROFILE_SKINS.some((s) => s.crewOnly)).toBe(false)
  })

  it('does not re-open the owner-held Midnight skin as a Crew theme', () => {
    expect(isCrewTheme('midnight')).toBe(false)
    expect(isCrewTheme('default')).toBe(false)
  })
})
