// FH-031S, the author's half: the host Event is a draft field, publish freezes it on the version as
// policy.finale.event_id (where the player's reader looks), and only an Event of the Hunt's own Space
// or of a live partner may be chosen, at the picker and again at publish.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type R = Record<string, unknown>
const tables: Record<string, R[]> = {}

function query(table: string) {
  const tests: ((r: R) => boolean)[] = []
  const rows = () => (tables[table] ?? []).filter((r) => tests.every((t) => t(r)))
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (tests.push((r) => r[c] === v), q),
    is: (c: string, v: unknown) => (tests.push((r) => (r[c] ?? null) === v), q),
    in: (c: string, v: unknown[]) => (tests.push((r) => v.includes(r[c])), q),
    gte: (c: string, v: string) => (tests.push((r) => typeof r[c] === 'string' && (r[c] as string) >= v), q),
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res),
  }
  return q
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }))

import { canonicalContent, parseTrailDraft, publishedPolicy } from './draft'
import { FINALE_BLOCK_ITEM, finaleEventAllowed, isCompletionReward } from './finale-draft'
import { finaleBlocksPublish, loadFinaleEventOptions } from './finale-store'
import { parseFinale } from './rally-finale'

const EVENT = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-11-16T12:00:00Z'
const base = { title: 'Coast Trail', hook: '', area: '', audience: '', stops: [{ place: 'A', clue: 'a', placementReady: true }] }
const event = (id: string, over: R = {}): R => ({ id, title: `Event ${id.slice(0, 1)}`, starts_at: '2026-12-01T19:00:00Z', status: 'published', is_cancelled: false, removed_at: null, host_space_id: 'home', space_id: null, host_id: 'someone', ...over })
const live = (space: string, over: R = {}): R => ({ hunt_id: 'h1', space_id: space, status: 'accepted', effective_at: '2026-11-01T00:00:00Z', revoked_at: null, ...over })
const hunt = { id: 'h1', owner_space_id: 'home' as string | null, owner_profile_id: 'author' }

beforeEach(() => {
  tables.hunts = [{ ...hunt }]
  tables.hunt_partners = []
  tables.events = []
})

describe('the finale on the draft and the published version', () => {
  it('keeps a chosen Event on the draft and drops anything that is not an id', () => {
    expect(parseTrailDraft({ ...base, finaleEventId: EVENT.toUpperCase() }).finaleEventId).toBe(EVENT)
    expect('finaleEventId' in parseTrailDraft({ ...base, finaleEventId: 'the big party' })).toBe(false)
    expect('finaleEventId' in parseTrailDraft(base)).toBe(false)
  })

  it('publishes the choice as policy.finale.event_id, where the player reader finds it', () => {
    const draft = parseTrailDraft({ ...base, finaleEventId: EVENT })
    expect(parseFinale(publishedPolicy(null, draft))).toEqual({ eventId: EVENT })
    // Clearing the finale on the next version removes it, whatever the earlier policy carried.
    expect(parseFinale(publishedPolicy({ finale: { event_id: EVENT } }, parseTrailDraft(base)))).toBeNull()
  })

  it('changes the content hash only for a trail that has a finale', () => {
    const plain = canonicalContent(parseTrailDraft(base))
    expect(plain).not.toContain('finale')
    expect(canonicalContent(parseTrailDraft({ ...base, finaleEventId: EVENT }))).not.toBe(plain)
  })
})

describe('which Events a trail may end at', () => {
  const rule = { ownerSpaceId: 'home', ownerProfileId: 'author', livePartnerSpaceIds: ['venue'] }
  const facts = { status: 'published', cancelled: false, removed: false, hostSpaceId: 'home', hostProfileId: 'someone' }

  it('allows the own Space and a live partner, and nothing else', () => {
    expect(finaleEventAllowed(facts, rule)).toBe(true)
    expect(finaleEventAllowed({ ...facts, hostSpaceId: 'venue' }, rule)).toBe(true)
    expect(finaleEventAllowed({ ...facts, hostSpaceId: 'stranger' }, rule)).toBe(false)
    expect(finaleEventAllowed({ ...facts, hostSpaceId: 'venue' }, { ...rule, livePartnerSpaceIds: [] })).toBe(false)
    // Another member's own Event is never a Space-owned Hunt's to end at, even the author's.
    expect(finaleEventAllowed({ ...facts, hostSpaceId: null, hostProfileId: 'author' }, rule)).toBe(false)
  })

  it('refuses a draft, cancelled, removed or missing Event', () => {
    expect(finaleEventAllowed({ ...facts, status: 'draft' }, rule)).toBe(false)
    expect(finaleEventAllowed({ ...facts, cancelled: true }, rule)).toBe(false)
    expect(finaleEventAllowed({ ...facts, removed: true }, rule)).toBe(false)
    expect(finaleEventAllowed(null, rule)).toBe(false)
  })

  it('gives a Hunt with no Space its owner’s own Events only', () => {
    const personal = { ownerSpaceId: null, ownerProfileId: 'author', livePartnerSpaceIds: [] }
    expect(finaleEventAllowed({ ...facts, hostSpaceId: null, hostProfileId: 'author' }, personal)).toBe(true)
    expect(finaleEventAllowed({ ...facts, hostSpaceId: null, hostProfileId: 'someone' }, personal)).toBe(false)
    expect(finaleEventAllowed(facts, personal)).toBe(false)
  })

  it('splits completion rewards from rewards for named stops', () => {
    expect(isCompletionReward({ run_state: 'completed' })).toBe(true)
    expect(isCompletionReward(null)).toBe(true)
    expect(isCompletionReward({ missions: ['stop-1'] })).toBe(false)
  })
})

describe('the picker and the publish check', () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

  it('offers upcoming Events of the own Space and of live partners, soonest first', async () => {
    tables.hunt_partners = [live('venue'), live('gone', { status: 'withdrawn', revoked_at: '2026-11-10T00:00:00Z' })]
    tables.events = [
      event(A, { starts_at: '2026-12-05T19:00:00Z' }),
      event(B, { host_space_id: null, space_id: 'venue', starts_at: '2026-12-01T19:00:00Z' }),
      event(C, { host_space_id: 'gone' }),
      event(D, { host_space_id: 'stranger' }),
      event(EVENT, { starts_at: '2026-10-01T19:00:00Z' }),
      event('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', { is_cancelled: true }),
    ]
    expect(await loadFinaleEventOptions('h1', NOW)).toEqual([
      { value: B, label: 'Event b (Dec 1, 2026)' },
      { value: A, label: 'Event a (Dec 5, 2026)' },
    ])
  })

  it('offers nothing for a Hunt that is not there', async () => {
    expect(await loadFinaleEventOptions('nope', NOW)).toEqual([])
  })

  it('blocks a publish whose Event stopped being allowed, and lets the others through', async () => {
    tables.events = [event(A), event(B, { host_space_id: 'venue' })]
    expect(await finaleBlocksPublish(hunt, undefined)).toBeNull()
    expect(await finaleBlocksPublish(hunt, A)).toBeNull()
    expect(await finaleBlocksPublish(hunt, B)).toBe(FINALE_BLOCK_ITEM)
    tables.hunt_partners = [live('venue')]
    expect(await finaleBlocksPublish(hunt, B)).toBeNull()
    // The partner withdraws after the author chose its Event: the next publish is refused.
    tables.hunt_partners = [live('venue', { status: 'withdrawn', revoked_at: '2026-11-10T00:00:00Z' })]
    expect(await finaleBlocksPublish(hunt, B)).toBe(FINALE_BLOCK_ITEM)
    tables.events[0].is_cancelled = true
    expect(await finaleBlocksPublish(hunt, A)).toBe(FINALE_BLOCK_ITEM)
    expect(await finaleBlocksPublish(hunt, C)).toBe(FINALE_BLOCK_ITEM)
  })
})
