import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultEventHostSpaceId } from './default-host-space'

const ROOT = 'root-space'
const HOUSE = 'house-of-fates'
const OTHER = 'other-space'

describe('defaultEventHostSpaceId (LIVE-376)', () => {
  it('returns nothing when the host runs no Space', () => {
    expect(defaultEventHostSpaceId([])).toBeUndefined()
  })

  it('returns nothing when the only Space is the root', () => {
    expect(defaultEventHostSpaceId([{ id: ROOT }], { rootId: ROOT })).toBeUndefined()
  })

  it('returns the one non-root Space a host runs', () => {
    expect(defaultEventHostSpaceId([{ id: HOUSE }], { rootId: ROOT })).toBe(HOUSE)
  })

  it('still picks the one real Space when the root is also in the list', () => {
    expect(defaultEventHostSpaceId([{ id: ROOT }, { id: HOUSE }], { rootId: ROOT })).toBe(HOUSE)
  })

  it('returns nothing when the host runs two real Spaces', () => {
    expect(defaultEventHostSpaceId([{ id: HOUSE }, { id: OTHER }], { rootId: ROOT })).toBeUndefined()
  })

  it('ignores a blank id so a broken row cannot become the default', () => {
    expect(defaultEventHostSpaceId([{ id: '  ' }, { id: HOUSE }], { rootId: ROOT })).toBe(HOUSE)
    expect(defaultEventHostSpaceId([{ id: '' }], { rootId: ROOT })).toBeUndefined()
  })

  it('treats a missing rootId as "no root", so a lone Space still wins', () => {
    expect(defaultEventHostSpaceId([{ id: HOUSE }])).toBe(HOUSE)
  })

  it('the create page applies the helper, and the Spark stamps that Space on the draft', () => {
    const page = readFileSync('app/(main)/events/new/page.tsx', 'utf8')
    expect(page).toContain('defaultEventHostSpaceId(spaces, { rootId: root })')
    const spark = readFileSync('app/(main)/events/event-spark.tsx', 'utf8')
    expect(spark).toContain('spaceId: groups.find((g) => g.id === defaultGroupId)')
  })
})
