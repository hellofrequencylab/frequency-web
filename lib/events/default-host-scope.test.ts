import { describe, expect, it } from 'vitest'
import { defaultEventHostScope } from './default-host-scope'

const house = { id: 'house-of-fates' }
const other = { id: 'other-space' }
const circle = { id: 'her-circle' }

describe('defaultEventHostScope (LIVE-376)', () => {
  it('honors ?space= when the caller runs that Space', () => {
    expect(
      defaultEventHostScope({
        spaceParam: house.id,
        spaces: [house, other],
        circles: [],
      }),
    ).toBe(house.id)
  })

  it('ignores ?space= for a Space the caller does not run', () => {
    expect(
      defaultEventHostScope({
        spaceParam: 'stranger',
        spaces: [house],
        circles: [],
      }),
    ).toBe(house.id)
  })

  it('prefers Duplicate Space over the sole-Space default', () => {
    expect(
      defaultEventHostScope({
        duplicateSpaceId: other.id,
        spaces: [house, other],
        circles: [],
      }),
    ).toBe(other.id)
  })

  it('prefers ?circle= over the sole-Space default', () => {
    expect(
      defaultEventHostScope({
        circleParam: circle.id,
        spaces: [house],
        circles: [circle],
      }),
    ).toBe(circle.id)
  })

  it('defaults a host of exactly one Space onto that Space', () => {
    expect(
      defaultEventHostScope({
        spaces: [house],
        circles: [circle],
      }),
    ).toBe(house.id)
  })

  it('does not guess when the host runs two Spaces and gave no deep link', () => {
    expect(
      defaultEventHostScope({
        spaces: [house, other],
        circles: [],
      }),
    ).toBeUndefined()
  })
})
