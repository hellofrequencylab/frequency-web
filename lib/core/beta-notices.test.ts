import { describe, it, expect } from 'vitest'
import {
  BETA_ENDS_LABEL,
  betaOpen,
  betaLeadLine,
  crewUpgradeSuffix,
  crewCreateUpsell,
  contentSafetyLine,
} from './beta-notices'

// These assert the rule's SHAPE + voice, and its behavior in the current (beta-open) state. When
// BETA_OPEN_ACCESS flips at launch, betaLeadLine() becomes null and the suffix changes; the no-em-dash
// invariant must hold in both states.

const noEmDash = (s: string) => expect(s.includes('—')).toBe(false)

describe('beta-notices copy rule', () => {
  it('exposes the launch date label', () => {
    expect(BETA_ENDS_LABEL).toMatch(/September/)
  })

  it('betaLeadLine reflects the flag and names the date when open', () => {
    if (betaOpen) {
      const lead = betaLeadLine()
      expect(lead).not.toBeNull()
      expect(lead as string).toContain(BETA_ENDS_LABEL)
      noEmDash(lead as string)
    } else {
      expect(betaLeadLine()).toBeNull()
    }
  })

  it('crewUpgradeSuffix swaps on the flag', () => {
    const suffix = crewUpgradeSuffix()
    noEmDash(suffix)
    expect(suffix).toBe(betaOpen ? 'Crew is free during the Beta, one tap, no card.' : 'Crew is a paid membership.')
  })

  it('crewCreateUpsell names the thing and carries the suffix', () => {
    const msg = crewCreateUpsell('a practice')
    expect(msg).toContain('a practice')
    expect(msg).toContain(crewUpgradeSuffix())
    noEmDash(msg)
  })

  it('contentSafetyLine promises nothing is lost, per kind, with no em dash', () => {
    for (const kind of ['practice', 'journey'] as const) {
      const line = contentSafetyLine(kind)
      expect(line.toLowerCase()).toContain('ever lost')
      expect(line).toContain('No content is deleted.')
      noEmDash(line)
    }
    // The Journey line names the specific outcome (extra Journeys stay private drafts).
    expect(contentSafetyLine('journey')).toContain('private drafts')
  })
})
