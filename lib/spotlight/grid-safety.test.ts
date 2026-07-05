import { describe, it, expect } from 'vitest'
import { resolveRows } from '@/lib/entity-blocks/layout'
import { resolveMemberBlockData } from '@/lib/entity-blocks/member-adapter'
import type { SpotlightData } from '@/lib/spotlight/data'

// SAFETY PROOF (ADR-522 follow-up): retiring the Puck engine must never blank an existing published
// Spotlight. The public /spotlight/<handle> now renders the GRID (resolveRows over meta.entityGrid); a
// member who only ever used the old Puck editor has meta.spotlight blocks but NO meta.entityGrid (grid is
// null). Two guarantees keep their page non-blank without any migration or Puck fallback:
//   1. resolveRows(null) yields the NON-EMPTY default starter layout (never zero rows).
//   2. The content blocks source from the retained validated data.layout (meta.spotlight), so the
//      member's authored headings/text/links/etc. still render — just arranged in the default order.

/** A member with a PUBLISHED Puck spotlight (authored blocks) but NO saved grid (entityGrid null). */
function puckOnlyMember(): SpotlightData {
  return {
    profile: {
      id: 'p1',
      handle: 'ada',
      display_name: 'Ada',
      avatar_url: null,
      header_image_url: null,
      bio: 'Building things.',
      community_role: null,
      profile_theme: null,
      current_streak: 3,
      lifetime_gems: 12,
      created_at: '2024-01-01T00:00:00.000Z',
      nexus_regions: { name: 'Portland' },
    },
    hostedEvents: [],
    layout: {
      version: 1,
      blocks: [
        { id: 'h1', type: 'heading', text: 'Welcome', level: 2 },
        { id: 't1', type: 'text', text: 'Thanks for stopping by.' },
        { id: 'l1', type: 'links', items: [{ label: 'Site', url: 'https://example.com' }] },
      ],
    },
    background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 },
    theme: {} as SpotlightData['theme'],
    totalZaps: 42,
    topFriends: [],
    grid: null, // the crux: no saved grid — the Puck-only member
  } as unknown as SpotlightData
}

describe('ADR-522: grid render keeps a published Puck spotlight non-blank', () => {
  it('resolveRows(null) yields a non-empty default member layout', () => {
    const rows = resolveRows(null, 'member')
    expect(rows.length).toBeGreaterThan(0)
    const placed = rows.flatMap((r) => r.cells.flat()).filter((s): s is string => s !== null)
    expect(placed.length).toBeGreaterThan(0)
  })

  it('preserves the member authored content from the retained data.layout', () => {
    const data = resolveMemberBlockData(puckOnlyMember())
    // The authored blocks are grouped by type and still available to render.
    expect(data.blocksByType.heading).toHaveLength(1)
    expect(data.blocksByType.text).toHaveLength(1)
    expect(data.links).toEqual([{ label: 'Site', url: 'https://example.com' }])
    // Data blocks still resolve from the profile row.
    expect(data.about).toBe('Building things.')
    expect(data.stats.zaps).toBe(42)
  })
})
