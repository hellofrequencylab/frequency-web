import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SPACE_PLAN_LABEL, planEntitlementKeys } from '@/lib/pricing/plans'
import {
  PROGRAM_ENTITLEMENT_KEY,
  programCatalogNote,
  programTeaseBody,
  programTeaseCta,
  programWallLabel,
} from './program-wall'

describe('programWallLabel (LIVE-434)', () => {
  it('names Business, the lowest paid plan that grants program', () => {
    expect(planEntitlementKeys('business')).toContain(PROGRAM_ENTITLEMENT_KEY)
    expect(programWallLabel()).toBe(SPACE_PLAN_LABEL.business)
    expect(programWallLabel()).not.toMatch(/Collective/)
  })

  it('the catalog note and tease interpolate that wall', () => {
    expect(programCatalogNote()).toBe(`Included with ${SPACE_PLAN_LABEL.business}`)
    expect(programTeaseBody()).toBe(
      `${SPACE_PLAN_LABEL.business} carries Programs, Chapters, and the Channel your Space owns, plus automation, team roles, and multiple pipelines.`,
    )
    expect(programTeaseCta()).toBe(`See what ${SPACE_PLAN_LABEL.business} adds`)
    expect(programCatalogNote()).not.toMatch(/Collective/)
    expect(programTeaseBody()).not.toMatch(/Collective/)
    expect(programTeaseCta()).not.toMatch(/Collective/)
  })
})

describe('Program writers never type Collective (LIVE-434)', () => {
  it('the Program page has no leftover plan name', () => {
    const src = readFileSync('app/(main)/spaces/[slug]/settings/program/page.tsx', 'utf8')
    expect(src).not.toMatch(/Collective/)
    expect(src).toContain('programTeaseBody')
    expect(src).toContain('programTeaseCta')
    expect(src).toContain("from '@/lib/spaces/program-wall'")
  })

  it('the catalog Program row uses programCatalogNote, not a retired plan name', () => {
    const src = readFileSync('lib/admin/modules/space-modules.ts', 'utf8')
    const row = src.match(/id: 'space\.program'[\s\S]*?parent: 'space\.content'/)
    expect(row?.[0]).toBeTruthy()
    expect(row?.[0]).toContain('programCatalogNote()')
    expect(row?.[0]).not.toMatch(/Collective/)
  })
})
