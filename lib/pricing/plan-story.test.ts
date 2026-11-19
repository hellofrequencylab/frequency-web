import { describe, expect, it } from 'vitest'
import { PLAN_STORY } from './plan-story'

describe('public plan story', () => {
  const copy = Object.values(PLAN_STORY).join(' ')

  // Owner 2026-11-19: "You can start a free space with a Crew account." The Oct 22 ruling (ADR-1818) stands.
  it('says a Space comes with Crew, and never that Crew is separate from hosting one', () => {
    expect(copy).toContain('A Space comes with Crew')
    expect(PLAN_STORY.lines).toBe('People join free. Host free with Crew. You pay when you start charging.')
    expect(copy).not.toMatch(/separate personal membership|a space is separate from crew/i)
  })

  // Owner 2026-11-18 (ADR-1978): "Free spaces cannot sell." "If a Crew member starts a free space, they
  // can take donations." The fee-only free selling rate was withdrawn, so the neutral wording that
  // waited on it is replaced by the rule. Pin rewrite approved by the owner the same day.
  it('says selling starts at Business and a free Space takes donations and tips only', () => {
    expect(PLAN_STORY.selling).toContain('Selling starts at Business')
    expect(PLAN_STORY.selling).toContain('A free Space sells nothing')
    expect(PLAN_STORY.rate).toContain('one finder’s fee, charged once on their first purchase and capped')
    expect(PLAN_STORY.rate).toContain('Tips have no platform fee on any plan, though card processing still applies')
    expect(PLAN_STORY.selling).not.toContain('Free Spaces use the fee-only selling rate')
    expect(copy).not.toMatch(/\b\d+%|\$\d|grandfathered|founder badge|midnight|—/i)
  })

  it('keeps Founding Year distinct from Founding Member and avoids a lifetime price promise', () => {
    expect(PLAN_STORY.founding).toContain('Founding Member is free early-member recognition')
    expect(PLAN_STORY.founding).toContain('Founding Year is a separate paid first-year offer')
    expect(PLAN_STORY.founding).toContain('January 31, 2027')
    expect(PLAN_STORY.founding).not.toMatch(/grandfathered|as long as you keep|founder badge/i)
  })
})
