import { describe, it, expect } from 'vitest'
import { resolveMemberBlockData, toMemberEntity } from './member-adapter'
import { SPOTLIGHT_STAT_KEYS, type SpotlightLayout } from '@/lib/spotlight/blocks/schema'
import type { SpotlightData } from '@/lib/spotlight/data'
import type { SpotlightRow } from '@/lib/spotlight/privacy'

// Pure keying tests for the U2a member adapter (no React / IO). Locks the data-bag derivation the
// member block components rely on: identity resolution, stat-key union, link flattening, per-type
// grouping, and the fail-safe defaults.

function row(over: Partial<SpotlightRow> = {}): SpotlightRow {
  return {
    id: 'p1',
    handle: 'ada',
    display_name: 'Ada',
    avatar_url: 'a.png',
    header_image_url: 'h.png',
    bio: 'Building things.',
    website: null,
    community_role: null,
    membership_tier: null,
    created_at: '2021-06-01T00:00:00Z',
    current_streak: 7,
    lifetime_gems: 42,
    profile_theme: null,
    is_active: true,
    is_system: false,
    nexus_regions: { name: 'Portland' },
    ...over,
  }
}

function data(layout: SpotlightLayout, over: Partial<SpotlightData> = {}): SpotlightData {
  return {
    profile: row(over.profile),
    hostedEvents: [],
    layout,
    background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 },
    theme: { header: { show: false, height: 0, focusY: 50 } } as unknown as SpotlightData['theme'],
    totalZaps: 1234,
    topFriends: [{ profileId: 'f1', handle: 'bob', displayName: 'Bob', avatarUrl: null }],
    ...over,
  }
}

describe('toMemberEntity', () => {
  it('builds a member identity, falling back to @handle when the display name is blank', () => {
    expect(toMemberEntity(data({ version: 1, blocks: [] }))).toMatchObject({
      kind: 'member',
      id: 'p1',
      slug: 'ada',
      displayName: 'Ada',
      logoUrl: 'a.png',
      coverUrl: 'h.png',
      tagline: 'Building things.',
    })
    const blank = data({ version: 1, blocks: [] }, { profile: row({ display_name: '  ' }) })
    expect(toMemberEntity(blank).displayName).toBe('@ada')
  })
})

describe('resolveMemberBlockData', () => {
  it('lifts about + authoritative stats and defaults stat keys to all when none chosen', () => {
    const bag = resolveMemberBlockData(data({ version: 1, blocks: [] }))
    expect(bag.about).toBe('Building things.')
    expect(bag.stats).toEqual({ zaps: 1234, streak: 7, gems: 42, joinedYear: 2021, region: 'Portland' })
    expect(bag.statKeys).toEqual([...SPOTLIGHT_STAT_KEYS])
    expect(bag.topFriends).toHaveLength(1)
  })

  it('unions the chosen stat keys across stats blocks, first-seen order, deduped', () => {
    const bag = resolveMemberBlockData(
      data({
        version: 1,
        blocks: [
          { id: 's1', type: 'stats', show: ['streak', 'zaps'] },
          { id: 's2', type: 'stats', show: ['zaps', 'gems'] },
        ],
      }),
    )
    expect(bag.statKeys).toEqual(['streak', 'zaps', 'gems'])
  })

  it('flattens link rows across every links block in order', () => {
    const bag = resolveMemberBlockData(
      data({
        version: 1,
        blocks: [
          { id: 'l1', type: 'links', items: [{ label: 'A', url: 'https://a.com' }] },
          { id: 'l2', type: 'links', items: [{ label: 'B', url: 'https://b.com' }] },
        ],
      }),
    )
    expect(bag.links.map((i) => i.label)).toEqual(['A', 'B'])
  })

  it('groups authored blocks by type and lifts the first topfriends title', () => {
    const bag = resolveMemberBlockData(
      data({
        version: 1,
        blocks: [
          { id: 'h1', type: 'heading', text: 'One', level: 2 },
          { id: 't1', type: 'text', text: 'para' },
          { id: 'h2', type: 'heading', text: 'Two', level: 3 },
          { id: 'tf', type: 'topfriends', title: 'My crew' },
        ],
      }),
    )
    expect(bag.blocksByType.heading).toHaveLength(2)
    expect(bag.blocksByType.text).toHaveLength(1)
    expect(bag.blocksByType.gallery).toEqual([])
    expect(bag.topFriendsTitle).toBe('My crew')
  })

  it('reads null about when the member has no bio', () => {
    const bag = resolveMemberBlockData(data({ version: 1, blocks: [] }, { profile: row({ bio: null }) }))
    expect(bag.about).toBeNull()
  })
})
