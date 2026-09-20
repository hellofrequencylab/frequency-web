import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

const CHOOSE_PLAN = 'app/(main)/spaces/[slug]/settings/billing/choose-plan.tsx'
const GO_BUSINESS = 'app/(main)/spaces/[slug]/settings/billing/go-business.tsx'

describe('ChoosePlanButton names the plan you bought (LIVE-438)', () => {
  it('does not type Collective on the paid confirmation', () => {
    const src = readFileSync(CHOOSE_PLAN, 'utf8')
    expect(src).not.toMatch(/You are on Collective/)
    expect(src).toContain('SPACE_PLAN_LABEL[plan]')
    expect(src).toContain("plan: 'business'")
  })

  it('the sibling Business CTA still confirms Business', () => {
    const src = readFileSync(GO_BUSINESS, 'utf8')
    expect(src).toContain(`You are on ${SPACE_PLAN_LABEL.business}.`)
    expect(src).not.toMatch(/You are on Collective/)
  })
})
