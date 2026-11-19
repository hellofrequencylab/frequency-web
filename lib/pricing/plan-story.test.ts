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

  it('keeps selling terms neutral until the Free selling option is live', () => {
    expect(PLAN_STORY.selling).toContain('Selling options and fees depend on your Space plan and the transaction')
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
