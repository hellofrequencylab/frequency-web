import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-667: a Hub-wide gathering is an event placed on the Space the Hub now is (ADR-1439), and
// the Hub's Guide / the Nexus's Mentor steward that Space's events. These pin who that is.

type Rows = Record<string, Array<Record<string, unknown>>>
let rows: Rows = {}

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  const q = {
    select: () => q,
    in: () => q,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return q
    },
    maybeSingle: () => Promise.resolve({ data: match()[0] ?? null }),
    then: (resolve: (r: { data: unknown[] }) => unknown) => resolve({ data: match() }),
  }
  const match = () => (rows[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

import { listPlaceLeadIds, listLedPlaceSpaceIds, listSpaceStewardIds, listSpaceEventCreatorIds } from './placement'

const HUB_SPACE = 'hub-space'
const NEXUS_SPACE = 'nexus-space'

beforeEach(() => {
  rows = {
    hubs: [{ space_id: HUB_SPACE, guide_id: 'guide-1' }, { space_id: 'other', guide_id: 'guide-2' }],
    nexuses: [{ space_id: NEXUS_SPACE, mentor_id: 'mentor-1' }],
    spaces: [{ id: HUB_SPACE, owner_profile_id: null }, { id: NEXUS_SPACE, owner_profile_id: 'mentor-1' }],
    space_members: [{ space_id: HUB_SPACE, profile_id: 'admin-1', role: 'admin', status: 'active' }],
  }
})

describe('Hub and Nexus event stewards (LIVE-667)', () => {
  it("names the Hub's Guide and the Nexus's Mentor for the Space each now is", async () => {
    expect(await listPlaceLeadIds(HUB_SPACE)).toEqual(['guide-1'])
    expect(await listPlaceLeadIds(NEXUS_SPACE)).toEqual(['mentor-1'])
    expect(await listPlaceLeadIds('plain-space')).toEqual([])
  })

  it('adds the lead to the approvers and the creators, once', async () => {
    expect((await listSpaceStewardIds(HUB_SPACE)).sort()).toEqual(['admin-1', 'guide-1'])
    expect(await listSpaceStewardIds(NEXUS_SPACE)).toEqual(['mentor-1'])
    expect((await listSpaceEventCreatorIds(HUB_SPACE)).sort()).toEqual(['admin-1', 'guide-1'])
  })

  it('lists the Hub and Nexus Spaces a profile leads', async () => {
    expect(await listLedPlaceSpaceIds('guide-1')).toEqual([HUB_SPACE])
    expect(await listLedPlaceSpaceIds('mentor-1')).toEqual([NEXUS_SPACE])
    expect(await listLedPlaceSpaceIds('nobody')).toEqual([])
  })
})
