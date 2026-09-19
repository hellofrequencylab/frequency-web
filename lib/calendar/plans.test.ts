import { describe, it, expect } from 'vitest'
import {
  derivePlanStage,
  keepExplicitExceptions,
  parsePlanInput,
  parsePlanLinks,
  planTargetDef,
} from './plans'

describe('parsePlanInput', () => {
  it('requires a title', () => {
    expect(parsePlanInput({ title: '  ' })).toEqual({ error: 'Give the Plan a title.' })
  })

  it('defaults a someday Plan to stage plan and target event', () => {
    const parsed = parsePlanInput({ title: 'Fall retreat' })
    expect('data' in parsed && parsed.data.stage).toBe('plan')
    expect('data' in parsed && parsed.data.target_kind).toBe('event')
  })
})

describe('parsePlanLinks', () => {
  it('keeps only http(s) urls', () => {
    expect(parsePlanLinks([{ url: 'javascript:alert(1)', label: 'x' }])).toEqual([])
    expect(parsePlanLinks([{ url: 'https://example.com/doc', label: 'Doc' }])).toEqual([
      { url: 'https://example.com/doc', label: 'Doc' },
    ])
  })
})

describe('derivePlanStage', () => {
  it('is plan when there are no dates', () => {
    expect(derivePlanStage({ entryStages: [], hasProductionEvent: false })).toBe('plan')
  })

  it('is pencil when every date is still a Pencil', () => {
    expect(derivePlanStage({ entryStages: ['pencil', 'pencil'], hasProductionEvent: false })).toBe('pencil')
  })

  it('is production once an event exists', () => {
    expect(derivePlanStage({ entryStages: ['planning'], hasProductionEvent: true })).toBe('production')
  })
})

describe('keepExplicitExceptions', () => {
  it('drops a skipped date and does not put it back', () => {
    expect(keepExplicitExceptions(['2026-10-04', '2026-10-18', '2026-11-01'], ['2026-10-18'])).toEqual([
      '2026-10-04',
      '2026-11-01',
    ])
  })
})

describe('planTargetDef', () => {
  it('opens the event Spark with plan and pencil ids', () => {
    const href = planTargetDef('event').createHref?.({ spaceId: 's', planId: 'p', entryId: 'e' })
    expect(href).toContain('/events/new?')
    expect(href).toContain('plan=p')
    expect(href).toContain('pencil=e')
  })

  it('has no Studio for maintenance', () => {
    expect(planTargetDef('maintenance').createHref).toBeNull()
  })
})
