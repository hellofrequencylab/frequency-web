import { describe, it, expect } from 'vitest'
import { normalizeTopFriendIds, toTopFriendRows } from './top-friends'
import { MAX_TOP_FRIENDS } from './blocks/schema'

// The Top Friends server actions (set/reorder/remove) are thin wrappers over these two
// pure functions plus the friendship re-check. The pure core is where the rules live:
// dedupe, self-removal, the Top-8 cap, and the dense 0-based ordering that becomes
// `position`. These tests lock that contract (the friendship + IO layer is exercised
// against the live `friendships` graph, not unit-mocked).

const OWNER = '8b0d1087-ed37-4bc4-8439-8a109de1a48d'
const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const C = 'cccccccc-0000-0000-0000-000000000003'

describe('normalizeTopFriendIds', () => {
  it('returns [] for non-array / garbage input (never throws)', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { ids: [] }]) {
      expect(normalizeTopFriendIds(OWNER, junk)).toEqual([])
    }
  })

  it('preserves the requested order', () => {
    expect(normalizeTopFriendIds(OWNER, [C, A, B])).toEqual([C, A, B])
  })

  it('drops the owner (no self-feature)', () => {
    expect(normalizeTopFriendIds(OWNER, [A, OWNER, B])).toEqual([A, B])
  })

  it('de-duplicates, keeping first-seen order', () => {
    expect(normalizeTopFriendIds(OWNER, [A, B, A, C, B])).toEqual([A, B, C])
  })

  it('drops blanks and non-strings, trims whitespace', () => {
    expect(normalizeTopFriendIds(OWNER, [' ', '', 7, `  ${A}  `, null])).toEqual([A])
  })

  it(`caps at MAX_TOP_FRIENDS (${MAX_TOP_FRIENDS})`, () => {
    const many = Array.from({ length: 50 }, (_, i) => `id-${i}`)
    const out = normalizeTopFriendIds(OWNER, many)
    expect(out).toHaveLength(MAX_TOP_FRIENDS)
    expect(out[0]).toBe('id-0')
    expect(out[MAX_TOP_FRIENDS - 1]).toBe(`id-${MAX_TOP_FRIENDS - 1}`)
  })

  it('counts the cap AFTER dedupe (duplicates do not eat slots)', () => {
    const dupHeavy = [A, A, A, A, A, B, C]
    expect(normalizeTopFriendIds(OWNER, dupHeavy)).toEqual([A, B, C])
  })
})

describe('toTopFriendRows', () => {
  it('maps an ordered id list to dense 0-based positions for the owner', () => {
    expect(toTopFriendRows(OWNER, [C, A, B])).toEqual([
      { owner_profile_id: OWNER, friend_profile_id: C, position: 0 },
      { owner_profile_id: OWNER, friend_profile_id: A, position: 1 },
      { owner_profile_id: OWNER, friend_profile_id: B, position: 2 },
    ])
  })

  it('returns [] for an empty selection', () => {
    expect(toTopFriendRows(OWNER, [])).toEqual([])
  })

  it('round-trips with normalize: order in = position order out', () => {
    const ids = normalizeTopFriendIds(OWNER, [B, OWNER, A, B, C])
    const rows = toTopFriendRows(OWNER, ids)
    expect(rows.map((r) => r.friend_profile_id)).toEqual([B, A, C])
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2])
    expect(rows.every((r) => r.owner_profile_id === OWNER)).toBe(true)
  })
})
