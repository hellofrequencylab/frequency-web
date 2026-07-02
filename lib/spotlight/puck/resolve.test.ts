import { describe, it, expect } from 'vitest'
import type { SpotlightData } from '@/lib/spotlight/data'
import { SPOTLIGHT_PUBLIC_BASE, spotlightRenderMeta, spotlightPuckDoc } from '@/lib/spotlight/puck/resolve'

// The ONE shared Spotlight → Puck resolver (ADR-500 Phase C). These lock the two invariants both
// render surfaces (standalone Signal page + in-app profile section) now depend on: the metadata is
// built identically from the profile row, and the empty-layout policy is caller-controlled.

function fixture(over: Partial<SpotlightData> = {}): SpotlightData {
  return {
    profile: {
      handle: 'ada',
      display_name: 'Ada Lovelace',
      current_streak: 7,
      lifetime_gems: 42,
      created_at: '2021-06-15T00:00:00.000Z',
      nexus_regions: { name: 'London' },
    },
    hostedEvents: [],
    layout: { version: 1, blocks: [] },
    background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 },
    theme: {},
    totalZaps: 1234,
    topFriends: [],
    ...over,
  } as unknown as SpotlightData
}

describe('spotlightRenderMeta', () => {
  it('maps the profile row + aggregates into the render metadata', () => {
    const meta = spotlightRenderMeta(fixture())
    expect(meta.stats).toEqual({
      zaps: 1234,
      streak: 7,
      gems: 42,
      joinedYear: 2021,
      region: 'London',
    })
    expect(meta.publicBase).toBe(SPOTLIGHT_PUBLIC_BASE)
  })

  it('passes Top Friends through untouched', () => {
    const topFriends = [{ handle: 'grace' }] as unknown as SpotlightData['topFriends']
    expect(spotlightRenderMeta(fixture({ topFriends })).topFriends).toBe(topFriends)
  })

  it('degrades missing region / created_at to null', () => {
    const meta = spotlightRenderMeta(
      fixture({
        profile: {
          handle: 'x',
          display_name: 'X',
          current_streak: 0,
          lifetime_gems: 0,
          created_at: null,
          nexus_regions: null,
        } as unknown as SpotlightData['profile'],
      }),
    )
    expect(meta.stats.joinedYear).toBeNull()
    expect(meta.stats.region).toBeNull()
  })
})

describe('spotlightPuckDoc', () => {
  it('returns null for an unbuilt layout by default (the in-app profile policy)', () => {
    expect(spotlightPuckDoc(fixture())).toBeNull()
  })

  it('seeds the link-tree preset for an unbuilt layout when seedWhenEmpty (the standalone page policy)', () => {
    const doc = spotlightPuckDoc(fixture(), { seedWhenEmpty: true })
    expect(doc).not.toBeNull()
    expect(doc!.content.length).toBeGreaterThan(0)
  })

  it('bridges a built layout into a Puck document regardless of the seed flag', () => {
    const built = fixture({ layout: { version: 1, blocks: [{ id: 'd1', type: 'divider' }] } })
    const doc = spotlightPuckDoc(built)
    expect(doc).not.toBeNull()
    expect(doc!.content.length).toBe(1)
  })
})
