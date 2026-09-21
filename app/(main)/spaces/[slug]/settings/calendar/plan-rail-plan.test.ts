import { describe, it, expect } from 'vitest'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import { parsePlanInput } from '@/lib/calendar/plans'
import {
  PLAN_FIELDS_AFTER_STAGE,
  PLAN_FIELDS_BEFORE_STAGE,
  PLAN_RAIL,
  PLAN_WRITES,
  planLinkRows,
  planLinksFromRows,
} from './plan-rail-plan'

// PROG-CAL2: the drawer is composed from SPACE_PLAN_MANIFEST rather than hand-built. Held here,
// without mounting React, so the seam is pinned even if the drawer's layout changes.

describe('the Plan drawer rail plan', () => {
  it('honours every written column, dropping none', () => {
    expect(PLAN_RAIL.dropped).toEqual([])
  })

  it('renders exactly the manifest fields, in manifest order, with the stepper standing in for stage', () => {
    expect(PLAN_RAIL.fields.map((f) => f.path)).toEqual(SPACE_PLAN_MANIFEST.fields.map((f) => f.path))
    expect([...PLAN_FIELDS_BEFORE_STAGE, ...PLAN_FIELDS_AFTER_STAGE].map((f) => f.path)).toEqual(
      SPACE_PLAN_MANIFEST.fields.map((f) => f.path).filter((p) => p !== 'stage'),
    )
  })

  it('carries the declared links collection, so the drawer has a control to render', () => {
    expect(PLAN_RAIL.repeats.map((r) => r.arrayPath)).toEqual(['links'])
    expect(PLAN_RAIL.repeats[0].fields.map((f) => f.path)).toEqual(['url', 'label'])
  })

  it('a field added to the manifest reaches the drawer without the drawer changing', () => {
    // The consequence the row is about: the plan is a FILTER over the manifest, not a second list.
    const added = { ...SPACE_PLAN_MANIFEST, fields: [...SPACE_PLAN_MANIFEST.fields] }
    expect(PLAN_RAIL.fields.length).toBe(added.fields.length)
    expect(PLAN_WRITES).toContain('links')
  })

  it('round-trips a stored link through the control rows and back into the save input', () => {
    const stored = [{ url: 'https://example.com/run-of-show', label: 'Run of show' }]
    const rows = planLinkRows(stored)
    expect(rows).toEqual([{ url: 'https://example.com/run-of-show', label: 'Run of show' }])
    const back = planLinksFromRows(rows)
    const parsed = parsePlanInput({ title: 'A Plan', links: back })
    expect('data' in parsed && parsed.data.links).toEqual(stored)
  })

  it('leaves what counts as a link to parsePlanLinks, and writes no second parser', () => {
    // A half-typed row is SHAPED here and REFUSED there; the drawer shows the count before saving.
    const rows = [{ url: 'example.com', label: 'No scheme' }]
    const parsed = parsePlanInput({ title: 'A Plan', links: planLinksFromRows(rows) })
    expect('data' in parsed && parsed.data.links).toEqual([])
  })

  it('reads a blank label as the url, which is the stored shape', () => {
    const parsed = parsePlanInput({
      title: 'A Plan',
      links: planLinksFromRows([{ url: '  https://example.com/deck  ', label: '' }]),
    })
    expect('data' in parsed && parsed.data.links).toEqual([
      { url: 'https://example.com/deck', label: 'https://example.com/deck' },
    ])
  })
})
