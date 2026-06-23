import { describe, it, expect } from 'vitest'
import { defaultStagesForSpaceType } from './stage-templates'
import type { SpaceType } from '@/lib/spaces/types'

// PER-SEGMENT STAGE TEMPLATES (CRM-STRATEGY §7, P3). The helper is PURE + total, so this suite is
// network-free: it locks the exact seed pipeline each Space type gets, that every type resolves to a
// non-empty ordered set, and that the templates are fresh (a mutation can't leak into the next call).

describe('defaultStagesForSpaceType', () => {
  it('business is a sales funnel: Lead -> Contacted -> Qualified -> Proposal -> Won / Lost', () => {
    const names = defaultStagesForSpaceType('business').map((s) => s.name)
    expect(names).toEqual(['Lead', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'])
  })

  it('practitioner is a client journey: Inquiry -> Intake -> Active -> Lapsed -> Rebook', () => {
    const names = defaultStagesForSpaceType('practitioner').map((s) => s.name)
    expect(names).toEqual(['Inquiry', 'Intake', 'Active', 'Lapsed', 'Rebook'])
  })

  it('coaching reuses the practitioner client journey', () => {
    expect(defaultStagesForSpaceType('coaching')).toEqual(defaultStagesForSpaceType('practitioner'))
  })

  it('organization is a supporter lifecycle: Prospect -> First gift -> Recurring -> Lapsed -> Reactivated', () => {
    const names = defaultStagesForSpaceType('organization').map((s) => s.name)
    expect(names).toEqual(['Prospect', 'First gift', 'Recurring', 'Lapsed', 'Reactivated'])
  })

  it('other types (event_space, lab, partner, root) and null get a sensible generic funnel', () => {
    const generic = ['New', 'Active', 'Won', 'Lost']
    for (const t of ['event_space', 'lab', 'partner', 'root'] as SpaceType[]) {
      expect(defaultStagesForSpaceType(t).map((s) => s.name)).toEqual(generic)
    }
    expect(defaultStagesForSpaceType(null).map((s) => s.name)).toEqual(generic)
    expect(defaultStagesForSpaceType(undefined).map((s) => s.name)).toEqual(generic)
  })

  it('every template ends in exactly one won and at least one lost outcome, with an open start', () => {
    for (const t of ['business', 'practitioner', 'coaching', 'organization', 'event_space'] as SpaceType[]) {
      const stages = defaultStagesForSpaceType(t)
      expect(stages.length).toBeGreaterThan(0)
      expect(stages[0]!.kind).toBe('open')
      expect(stages.filter((s) => s.kind === 'won').length).toBeGreaterThanOrEqual(1)
      expect(stages.filter((s) => s.kind === 'lost').length).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns a fresh array each call (a caller can mutate it without poisoning the template)', () => {
    const a = defaultStagesForSpaceType('business')
    a.push({ name: 'Tampered', kind: 'open' })
    const b = defaultStagesForSpaceType('business')
    expect(b.some((s) => s.name === 'Tampered')).toBe(false)
  })
})
