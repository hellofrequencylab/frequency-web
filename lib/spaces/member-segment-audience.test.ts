import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ═══ THE MEMBER-SEGMENT AUDIENCE (LIVE-293) ═════════════════════════════════════════════════════
//
// The Space Message center is retired. Its audience picker moved into Email, and this file is where
// the two things that could quietly break on the way over are pinned down:
//
//   1. 🔴 THE JOIN IS BY EMAIL, NEVER BY `profile_id`. Per-space contact tenancy (ADR-624) makes a
//      TENANT Space's contacts carry `profile_id` NULL BY LAW. lib/spaces/audiences.ts already has a
//      facet that gets this wrong (`place`, which narrows on `c.profileId`), so it resolves to ZERO
//      recipients on every Space but the root hub. EVERY behavioural test below seeds the sending
//      Space's contacts with `profile_id: null`, which is the real production shape: if the member
//      segment ever joins through `profile_id` again, these go red instead of quietly reaching nobody.
//
//   2. 🔴 THE CONSENT BAR HOLDS. The retiring route hard-coded `topic: 'marketing'` on a member blast,
//      the strictest of the three consent bars. The Email composer lets an operator pick a topic per
//      campaign, so the rule is enforced at the RESOLVER (`resolveAudiencePlan`), not in the picker: a
//      transactional pick plus a member segment cannot produce a transactional send.
//
// It also carries the four ADR-863 PRIVACY invariants the deleted
// lib/spaces/message-center-privacy.test.ts held over the deleted send action. Those had to move
// rather than be dropped: deleting that file would have retired ADR-863's only enforcement BY PASSING.

const SENDING = 'space-A'
const ROOT = 'space-root'

type ContactRow = { id: string; email: string | null; space_id: string; profile_id: string | null }

const db = { contacts: [] as ContactRow[] }
/** Every filter the code applied to a `contacts` read, so a test can assert HOW it narrowed. */
const reads: { space_id?: string; inCols: string[] }[] = []

// A chainable `contacts` mock supporting BOTH shapes in play:
//   audiences.ts       .select(cols).eq('space_id', v).limit(n)
//   the segment lookup .select(cols).eq('space_id', v).in('profile_id', ids)   [awaited directly]
function contactsBuilder() {
  const f: { space_id?: string; profileIds?: string[]; emails?: string[] } = {}
  const record = { space_id: undefined as string | undefined, inCols: [] as string[] }
  reads.push(record)
  const rows = () => {
    let data = db.contacts.filter((c) => c.space_id === f.space_id)
    if (f.profileIds) data = data.filter((c) => c.profile_id != null && f.profileIds!.includes(c.profile_id))
    if (f.emails) data = data.filter((c) => c.email != null && f.emails!.includes(c.email.toLowerCase()))
    return {
      data: data.map((c) => ({ id: c.id, email: c.email, profile_id: c.profile_id, consent_state: null })),
      error: null,
    }
  }
  const api = {
    select: () => api,
    eq(col: string, val: string) {
      if (col === 'space_id') {
        f.space_id = val
        record.space_id = val
      }
      return api
    },
    in(col: string, vals: string[]) {
      record.inCols.push(col)
      if (col === 'profile_id') f.profileIds = vals
      if (col === 'email') f.emails = vals.map((v) => v.toLowerCase())
      return api
    },
    limit: async () => rows(),
    then(resolve: (v: ReturnType<typeof rows>) => void) {
      resolve(rows())
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'contacts') return contactsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

// The Space's member segments. The real resolver is locked by lib/spaces/broadcast-audience.test.ts;
// here it is the seam, so the pairing is what is under test.
const segmentProfiles: Record<string, string[]> = {}
vi.mock('@/lib/spaces/broadcast-audience', () => ({
  resolveSpaceBroadcastAudience: async (_spaceId: string, keys: readonly string[]) =>
    segmentProfiles[keys[0] ?? ''] ?? [],
}))

let rootSpaceId: string | null = ROOT
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => rootSpaceId }))

import { contactIdsInMemberSegment } from './member-segment-audience'
import {
  resolveAudience,
  resolveAudiencePlan,
  audienceCount,
  definitionToFilter,
  normalizeMemberSegment,
  isMemberSegmentFilter,
  topicForAudience,
  MEMBER_SEGMENT_TOPIC,
} from './audiences'

/** Seed one contact. NOTE the default: `profile_id: null`, which is what a TENANT space really has. */
function seed(id: string, email: string, spaceId = SENDING, profileId: string | null = null) {
  db.contacts.push({ id, email, space_id: spaceId, profile_id: profileId })
}

beforeEach(() => {
  db.contacts = []
  reads.length = 0
  rootSpaceId = ROOT
  for (const k of Object.keys(segmentProfiles)) delete segmentProfiles[k]
})

// ── PURE: the grammar ───────────────────────────────────────────────────────────────────────────

describe('normalizeMemberSegment (pure)', () => {
  it('accepts the four keys lib/spaces/broadcast-audience.ts emits', () => {
    expect(normalizeMemberSegment('members')).toBe('members')
    expect(normalizeMemberSegment('tier:t1')).toBe('tier:t1')
    expect(normalizeMemberSegment('circle:c-1')).toBe('circle:c-1')
    expect(normalizeMemberSegment('event:e_1')).toBe('event:e_1')
  })

  it('trims, so a stray space around a real key is not a refusal', () => {
    expect(normalizeMemberSegment(' members ')).toBe('members')
  })

  it('refuses anything else, including a bare prefix and a hostile value', () => {
    for (const bad of ['', '  ', 'tier:', 'circle', 'hub:h1', 'tier:a b', 'tier:*', 'members;drop', 42, null]) {
      expect(normalizeMemberSegment(bad)).toBeNull()
    }
  })
})

describe('isMemberSegmentFilter (pure)', () => {
  it('is true only when a member segment is actually set', () => {
    expect(isMemberSegmentFilter({ memberSegment: 'tier:t1' })).toBe(true)
    expect(isMemberSegmentFilter({ memberSegment: '' })).toBe(false)
    expect(isMemberSegmentFilter({ memberSegment: null })).toBe(false)
    expect(isMemberSegmentFilter({ tag: 'vip' })).toBe(false)
    expect(isMemberSegmentFilter({})).toBe(false)
  })
})

describe('definitionToFilter reads memberSegment (so a SCHEDULED send cannot widen)', () => {
  // The scheduled-send cron rebuilds a campaign's audience through definitionToFilter. If the key were
  // dropped there, a scheduled TIER blast would resolve to the Space's WHOLE contact book. Widening a
  // send is the one failure mode worse than refusing it.
  it('keeps a valid key, from either the camelCase or the snake_case shape', () => {
    expect(definitionToFilter({ memberSegment: 'tier:t1' })).toEqual({ memberSegment: 'tier:t1' })
    expect(definitionToFilter({ member_segment: 'circle:c1' })).toEqual({ memberSegment: 'circle:c1' })
  })

  it('drops an invalid key rather than storing it', () => {
    expect(definitionToFilter({ memberSegment: 'hub:h1' })).toEqual({})
    expect(definitionToFilter({ memberSegment: 7 })).toEqual({})
  })
})

// ── THE CONSENT BAR (owner ruling 2026-09-10) ───────────────────────────────────────────────────

describe('topicForAudience: a member audience is pinned to the strictest consent bar', () => {
  it('pins a member segment to marketing whatever the operator picked', () => {
    expect(MEMBER_SEGMENT_TOPIC).toBe('marketing')
    for (const picked of ['events', 'dispatches', 'marketing', undefined, null, 'nonsense']) {
      expect(topicForAudience(picked, { memberSegment: 'tier:t1' })).toBe('marketing')
    }
  })

  it('leaves a contact-book audience with the operator’s own pick', () => {
    expect(topicForAudience('events', { tag: 'vip' })).toBe('events')
    expect(topicForAudience('dispatches', {})).toBe('dispatches')
  })

  it('falls back to marketing on a malformed pick, exactly as the pre-topic send did', () => {
    expect(topicForAudience('not-a-topic', {})).toBe('marketing')
    expect(topicForAudience(undefined, {})).toBe('marketing')
  })
})

describe('resolveAudiencePlan: a transactional topic + a member segment cannot send transactional', () => {
  it('returns the recipients AND the forced topic from one pass', async () => {
    seed('c1', 'ada@example.com')
    seed('r1', 'ada@example.com', ROOT, 'p1')
    segmentProfiles['tier:gold'] = ['p1']

    // 'events' is the softer, transactional-adjacent lane an operator could pick in the composer.
    const plan = await resolveAudiencePlan(SENDING, { memberSegment: 'tier:gold' }, 'events')
    expect(plan.recipients).toEqual([{ contactId: 'c1', email: 'ada@example.com' }])
    expect(plan.topic).toBe('marketing')
  })

  it('catches a member segment hidden inside a SAVED segment, not just a top-level one', () => {
    // The rule reads the EFFECTIVE filter, so the saved-segment indirection cannot launder the topic.
    // (definitionToFilter is what a saved definition passes through; the arm above pins that it keeps
    // the key, and resolveAudiencePlan applies topicForAudience to the expanded filter.)
    expect(topicForAudience('events', definitionToFilter({ memberSegment: 'circle:c1' }))).toBe('marketing')
  })

  it('keeps the operator’s topic when the audience is the ordinary contact book', async () => {
    seed('c1', 'ada@example.com')
    const plan = await resolveAudiencePlan(SENDING, { tag: null }, 'dispatches')
    expect(plan.recipients).toHaveLength(1)
    expect(plan.topic).toBe('dispatches')
  })
})

// ── 🔴 THE JOIN (the trap this row was filed against) ───────────────────────────────────────────

describe('contactIdsInMemberSegment pairs BY EMAIL, on contacts whose profile_id is NULL', () => {
  it('finds the sending Space’s contacts for a segment even with no profile link anywhere', async () => {
    // The production shape of a tenant Space: every contact row has profile_id NULL (ADR-624).
    seed('c-ada', 'ada@example.com')
    seed('c-grace', 'grace@example.com')
    seed('r-ada', 'Ada@Example.com', ROOT, 'p1') // un-normalized platform row, on purpose
    seed('r-grace', 'grace@example.com', ROOT, 'p2')
    segmentProfiles['circle:morning'] = ['p1', 'p2']

    const ids = await contactIdsInMemberSegment(SENDING, 'circle:morning', [
      { id: 'c-ada', email: 'ada@example.com' },
      { id: 'c-grace', email: 'grace@example.com' },
    ])
    expect([...ids].sort()).toEqual(['c-ada', 'c-grace'])
  })

  it('drops a member the Space holds no contact card for (ADR-863: contacts only)', async () => {
    seed('r-ada', 'ada@example.com', ROOT, 'p1')
    seed('r-lin', 'lin@example.com', ROOT, 'p2')
    segmentProfiles['members'] = ['p1', 'p2']

    const ids = await contactIdsInMemberSegment(SENDING, 'members', [
      { id: 'c-ada', email: 'ada@example.com' },
    ])
    expect([...ids]).toEqual(['c-ada'])
  })

  it('never narrows the SENDING space by profile_id; profile_id is used on the ROOT read only', async () => {
    seed('c-ada', 'ada@example.com')
    seed('r-ada', 'ada@example.com', ROOT, 'p1')
    segmentProfiles['members'] = ['p1']
    await contactIdsInMemberSegment(SENDING, 'members', [{ id: 'c-ada', email: 'ada@example.com' }])

    const sendingReads = reads.filter((r) => r.space_id === SENDING)
    for (const r of sendingReads) expect(r.inCols).not.toContain('profile_id')
    const rootReads = reads.filter((r) => r.space_id === ROOT)
    expect(rootReads).toHaveLength(1)
    expect(rootReads[0]!.inCols).toEqual(['profile_id'])
  })

  it('FAIL-SAFE to nobody: empty segment, no root space, no contacts, empty audience', async () => {
    expect(await contactIdsInMemberSegment(SENDING, 'members', [{ id: 'c', email: 'a@b.co' }])).toEqual(new Set())

    segmentProfiles['members'] = ['p1']
    seed('r-ada', 'ada@example.com', ROOT, 'p1')
    expect(await contactIdsInMemberSegment(SENDING, 'members', [])).toEqual(new Set())
    expect(await contactIdsInMemberSegment('', 'members', [{ id: 'c', email: 'a@b.co' }])).toEqual(new Set())
    expect(await contactIdsInMemberSegment(SENDING, '', [{ id: 'c', email: 'a@b.co' }])).toEqual(new Set())

    rootSpaceId = null
    expect(
      await contactIdsInMemberSegment(SENDING, 'members', [{ id: 'c-ada', email: 'ada@example.com' }]),
    ).toEqual(new Set())
  })
})

describe('resolveAudience — the memberSegment facet end to end', () => {
  it('resolves a tier to the Space’s own contacts, with every profile_id NULL', async () => {
    seed('c-ada', 'ada@example.com')
    seed('c-lin', 'lin@example.com')
    seed('r-ada', 'ada@example.com', ROOT, 'p1')
    seed('r-lin', 'lin@example.com', ROOT, 'p2')
    segmentProfiles['tier:gold'] = ['p1']

    const out = await resolveAudience(SENDING, { memberSegment: 'tier:gold' })
    expect(out).toEqual([{ contactId: 'c-ada', email: 'ada@example.com' }])
    // The live count in the picker resolves the same way, so it can never disagree with the send.
    expect(await audienceCount(SENDING, { memberSegment: 'tier:gold' })).toBe(1)
  })

  it('narrows to NOBODY on an unrecognized key, rather than falling through to everyone', async () => {
    seed('c-ada', 'ada@example.com')
    seed('c-lin', 'lin@example.com')
    expect(await resolveAudience(SENDING, { memberSegment: 'hub:h1' })).toEqual([])
    expect(await resolveAudience(SENDING, { memberSegment: 'tier:' })).toEqual([])
  })

  it('never reaches another Space’s contacts through a member segment', async () => {
    seed('c-ada', 'ada@example.com')
    seed('b-ada', 'ada@example.com', 'space-B')
    seed('r-ada', 'ada@example.com', ROOT, 'p1')
    segmentProfiles['members'] = ['p1']

    const out = await resolveAudience(SENDING, { memberSegment: 'members' })
    expect(out).toEqual([{ contactId: 'c-ada', email: 'ada@example.com' }])
  })
})

// ── ADR-863 PRIVACY INVARIANTS, moved off the deleted send action ────────────────────────────────
//
// These four were the whole content of lib/spaces/message-center-privacy.test.ts, a source-shape guard
// over app/(main)/spaces/[slug]/messages/broadcast-actions.ts. That file is gone, so the guard is
// re-pointed at the two modules that now carry the same data flow. Source-shape for the same reason it
// was before: the defect was a DATA-FLOW one (an auth email reaching the operator-visible send ledger),
// which no unit of a pure helper can expose.

describe('the member-segment resolver never harvests member auth emails (ADR-863)', () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')
  const resolver = read('lib/spaces/member-segment-audience.ts')
  const audiences = read('lib/spaces/audiences.ts')

  it('reads no auth account emails anywhere on the path', () => {
    for (const src of [resolver, audiences]) {
      expect(src).not.toContain('getUserById')
      expect(src).not.toContain('auth.admin')
    }
  })

  it('resolves the email audience to CONTACTS, scoped by space_id', () => {
    // Both reads on the path are space-scoped: the sending Space's own book, and the ROOT lane.
    expect(resolver).toMatch(/from\('contacts'\)[\s\S]{0,160}eq\('space_id', rootSpaceId\)/)
    expect(audiences).toMatch(/from\('contacts'\)[\s\S]{0,160}eq\('space_id', spaceId\)/)
  })

  it('joins the sending space to its contacts by EMAIL, never by profile_id', () => {
    expect(resolver).toContain('pairSpaceContacts')
    expect(resolver).toContain('audienceEmailsByProfile')
    // profile_id appears exactly once as a filter, and it is the ROOT lane.
    expect(resolver).toMatch(/eq\('space_id', rootSpaceId\)[\s\S]{0,80}in\('profile_id'/)
    expect(resolver).not.toMatch(/eq\('space_id', spaceId\)[\s\S]{0,120}in\('profile_id'/)
    // And the narrowing in audiences.ts pairs contact ids, never profile ids.
    expect(audiences).toMatch(/contactIdsInMemberSegment\([\s\S]{0,200}inSegment\.has\(c\.id\)/)
  })

  it('resolves no shared upfront recipient list before the per-lane gates', () => {
    // The old defect resolved the FULL audience (one Auth call each) before any lane ran.
    for (const src of [resolver, audiences]) expect(src).not.toContain('resolveRecipients(')
  })
})
