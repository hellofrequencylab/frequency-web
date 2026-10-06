// LIVE-748 / ADR-1709: every meter reads the five-tier ladder's numbers, per tier. One row per spec
// line of the owner's pricing ladder report (2026-10-06); null = unlimited. A change to a number in
// lib/pricing/meter-limits.ts that the ladder did not decide fails here.
import { describe, expect, it } from 'vitest'
import { allowanceAt } from './feature-meters'
import type { Allowance } from './meter-limits'

type SpaceRow = [key: string, space: Allowance, business: Allowance, collective: Allowance]
type PersonalRow = [key: string, member: Allowance, crew: Allowance]

const SPACE_LIMITS: SpaceRow[] = [
  ['space_crm', 250, 5_000, 25_000],
  ['space_email', 1_000, 25_000, 100_000],
  ['space_automation', 100, 2_000, 10_000],
  ['space_multi_pipeline', 1, 5, null],
  ['space_journey_publish', 1, 10, null],
  ['space_journey', 25, null, null],
  ['space_bookings', 20, null, null],
  ['space_membership_tiers', 1, 5, null],
  ['space_team', 1, 2, 5],
  ['space_collaborators', 0, 3, null],
  ['space_vera', 10, 200, null],
  ['space_crm_resonance_ai', 10, 2_000, 10_000],
]

const PERSONAL_LIMITS: PersonalRow[] = [
  ['circle_host', 1, 5],
  ['event_create', 2, 10],
  ['journey_publish', 1, 5],
  ['journey_enrollees', 10, 50],
  ['practice_publish', 3, null],
  ['vera_unlimited', 10, null],
]

describe('the five-tier ladder limits (ADR-1709)', () => {
  it.each(SPACE_LIMITS)('%s: Space %s, Business %s, Collective %s', (key, space, business, collective) => {
    expect(allowanceAt(key, 'free')).toBe(space)
    expect(allowanceAt(key, 'business')).toBe(business)
    expect(allowanceAt(key, 'collective')).toBe(collective)
  })

  it.each(SPACE_LIMITS)('%s: Non Profit and Independent read Business, Non Profit Collective reads Collective', (key, _space, business, collective) => {
    expect(allowanceAt(key, 'nonprofit')).toBe(business)
    expect(allowanceAt(key, 'independent')).toBe(business)
    expect(allowanceAt(key, 'nonprofit_collective')).toBe(collective)
  })

  it.each(PERSONAL_LIMITS)('%s: Member %s, Crew %s', (key, member, crew) => {
    expect(allowanceAt(key, 'free')).toBe(member)
    expect(allowanceAt(key, 'crew')).toBe(crew)
  })

  it('space_qr: editable QR codes per the owner ruling (Space 0, Business 3, Collective and Non Profit 5)', () => {
    expect(allowanceAt('space_qr', 'free')).toBe(0)
    expect(allowanceAt('space_qr', 'business')).toBe(3)
    expect(allowanceAt('space_qr', 'independent')).toBe(3)
    expect(allowanceAt('space_qr', 'nonprofit')).toBe(5)
    expect(allowanceAt('space_qr', 'collective')).toBe(5)
    expect(allowanceAt('space_qr', 'nonprofit_collective')).toBe(5)
  })

  it('an unknown plan falls to the free Space floor', () => {
    expect(allowanceAt('space_crm', 'not-a-plan')).toBe(250)
  })
})
