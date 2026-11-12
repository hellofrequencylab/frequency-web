import { describe, expect, it } from 'vitest'
import { PLAN_STORY } from './plan-story'

describe('public plan story', () => {
  const copy = Object.values(PLAN_STORY).join(' ')

  it('keeps Crew separate from free Space hosting', () => {
    expect(copy).toContain('Crew is a separate personal membership')
    expect(copy).not.toMatch(/host free with crew|a space comes with crew/i)
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
