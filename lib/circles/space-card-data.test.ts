import { describe, expect, it } from 'vitest'
import { spaceCircleToCardData } from './space-card-data'
import type { SpaceCircleItem } from '@/lib/spaces/content-data'

// The Circles block draws the SHARED CircleCard now, and this adapter is the whole seam between the
// Space's row and that card. Before the redesign the block rendered a bespoke list of name + about +
// member count; every other field the reader had already selected was dropped on the floor. These
// cases pin the fields whose loss DEGRADES a card silently rather than breaking it — which is the
// failure mode that let the old block look finished while showing a third of the data.

function item(over: Partial<SpaceCircleItem> = {}): SpaceCircleItem {
  return {
    id: 'c1',
    slug: 'hearth',
    name: 'Hearth',
    about: 'Sunday supper',
    memberCount: 12,
    memberCap: 40,
    type: 'in-person',
    status: 'active',
    access: 'open',
    imageUrl: 'https://example.test/c.jpg',
    neighborhood: 'Vista',
    isSpacePrimary: false,
    ...over,
  }
}

describe('spaceCircleToCardData', () => {
  it('carries every field the card draws', () => {
    expect(spaceCircleToCardData(item())).toEqual({
      id: 'c1',
      name: 'Hearth',
      slug: 'hearth',
      about: 'Sunday supper',
      type: 'in-person',
      member_count: 12,
      member_cap: 40,
      status: 'active',
      context: 'Vista',
      imageUrl: 'https://example.test/c.jpg',
      access: 'open',
    })
  })

  // The card prints "Online" by itself when `context` is null. A neighbourhood on a circle that does
  // not meet anywhere is a claim the data does not support, so it is dropped rather than shown.
  it('drops the neighbourhood for an online circle', () => {
    expect(spaceCircleToCardData(item({ type: 'online' })).context).toBeNull()
    expect(spaceCircleToCardData(item({ type: 'in-person' })).context).toBe('Vista')
  })

  // An in-person circle with no neighbourhood is the COMMON case (most circles carry no city), so
  // the null must reach the card, which has its own "In person" fallback. Synthesising a placeholder
  // here would defeat it.
  it('passes a missing neighbourhood through as null, not a placeholder', () => {
    expect(spaceCircleToCardData(item({ neighborhood: null })).context).toBeNull()
  })

  // AXIS 2 (ADR-1015): the card swaps Join for a link to the circle's own page when it knows the
  // circle is closed. Dropping `access` is what turns a card into a lie, because `canJoinCircle`
  // would refuse the Join the card just offered.
  it('carries access so a closed circle never offers a Join it cannot honour', () => {
    expect(spaceCircleToCardData(item({ access: 'closed' })).access).toBe('closed')
    expect(spaceCircleToCardData(item({ access: null })).access).toBeNull()
  })

  // The capacity meter and the "N of M" / "Almost full" / "spots left" line all read member_cap. An
  // uncapped circle carries 0, which the card reads as "no meter" rather than "full".
  it('carries capacity, including the uncapped zero', () => {
    expect(spaceCircleToCardData(item({ memberCap: 0 })).member_cap).toBe(0)
    expect(spaceCircleToCardData(item({ memberCap: 300, memberCount: 299 }))).toMatchObject({
      member_cap: 300,
      member_count: 299,
    })
  })

  // A `forming` circle is listable (LISTABLE_CIRCLE_STATUS) and the Space Circle is admitted to the
  // block even while unlisted (ADR-1393), so `status` has to survive the mapping for the card to be
  // able to say what it is.
  it('carries a forming status through', () => {
    expect(spaceCircleToCardData(item({ status: 'forming' })).status).toBe('forming')
  })

  // The cover is the single biggest visual gap the redesign closed, and a null cover is the MAJORITY
  // case across the platform, not an edge: the card owns the gradient fallback, so null must arrive
  // as null rather than as an empty string that would render a broken image frame.
  it('passes a missing cover through as null', () => {
    expect(spaceCircleToCardData(item({ imageUrl: null })).imageUrl).toBeNull()
  })
})
