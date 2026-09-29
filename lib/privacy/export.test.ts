import { describe, it, expect, vi, beforeEach } from 'vitest'

// The security contract for the member export: EVERY read is bound to the caller's own
// profile id, the network child tables are bound to the caller's OWN contact ids, and the one
// read that filters on an email instead of an id is bound to the caller's own VERIFIED account
// address (ADR-854) — it must not fire at all for an unconfirmed address. A recorder mock captures
// every filter the builder applies so we can prove no query is unscoped (the admin client bypasses
// RLS, so these in-code filters ARE the access control).

type Call = { table: string; method: string; col?: string; val?: unknown }
const { calls, authUser, bigTables, failFrom, createAdminClient } = vi.hoisted(() => {
  const calls: Call[] = []
  // ADR-1599 paging fixtures. `bigTables` swaps a table's rows for a long list so a read has to
  // cross pages; `failFrom` makes a table's pages error from that offset on.
  const bigTables = new Map<string, Record<string, unknown>[]>()
  const failFrom = new Map<string, number>()
  // Mutable so a test can drop the caller's address to unconfirmed and assert the gate holds.
  const authUser: { email: string | null; email_confirmed_at: string | null } = {
    // Deliberately mixed-case: the guest-seat read must normalise before matching.
    email: 'Me@Example.COM',
    email_confirmed_at: '2026-03-04T00:00:00Z',
  }
  // network_contacts returns two owned rows so the child (.in) reads are exercised. The three
  // event_rsvps reads return DIFFERENT (overlapping) seats so the merge + dedupe is exercised too.
  const rowsFor = (table: string, col?: string): Record<string, unknown>[] => {
    const big = bigTables.get(table)
    if (big) return big
    if (table === 'network_contacts') return [{ id: 'c1' }, { id: 'c2' }]
    // One friendship on each side, carrying the embedded handles the read asks for.
    if (table === 'friendships' && col === 'user_a_id')
      return [
        {
          id: 'f1',
          user_a_id: 'me',
          user_b_id: 'them',
          requested_by: 'me',
          a: { handle: 'me' },
          b: { handle: 'river' },
          introducer: null,
        },
      ]
    if (table === 'friendships' && col === 'user_b_id')
      return [
        {
          id: 'f2',
          user_a_id: 'other',
          user_b_id: 'me',
          requested_by: 'other',
          a: { handle: 'sky' },
          b: { handle: 'me' },
          introducer: { handle: 'river' },
        },
      ]
    if (table === 'notifications')
      return [{ id: 'n1', type: 'friend_request', actor: { handle: 'river' } }]
    if (table === 'space_memberships')
      return [
        {
          id: 'ms1',
          space_id: 's2',
          status: 'active',
          started_at: '2026-06-01T00:00:00Z',
          space: { name: 'Lantern House', slug: 'lantern-house' },
          tier: { name: 'Regular' },
        },
      ]
    if (table === 'space_members')
      return [
        {
          id: 'sm1',
          space_id: 's1',
          role: 'member',
          created_at: '2026-05-01T00:00:00Z',
          space: { name: 'Stillwater', slug: 'stillwater' },
          inviter: { handle: 'sky' },
        },
      ]
    if (table === 'event_rsvps') {
      if (col === 'profile_id') return [{ id: 'r1' }, { id: 'r2' }]
      // A claimed guest seat carries both identities, so r2 comes back from this read as well.
      if (col === 'guest_claimed_by') return [{ id: 'r2' }]
      if (col === 'guest_email') return [{ id: 'r3' }]
    }
    return []
  }
  const singleFor = (table: string): Record<string, unknown> | null =>
    table === 'profiles'
      ? { id: 'me', handle: 'me', auth_user_id: 'auth-me' }
      : table === 'ai_member_context'
        ? { profile_id: 'me' }
        : null

  // A chainable recorder: every filter is logged, and awaiting the chain resolves the rows keyed to
  // the last VALUE-BEARING filter (`.is('profile_id', null)` narrows, it does not select a fixture).
  // `.range(from, to)` slices those rows the way PostgREST would, so paging is exercised for real.
  const makeQuery = (table: string) => {
    let rowsCol: string | undefined
    let lastEq: { col?: string; val?: unknown } = {}
    let window: [number, number] | undefined
    const q = {
      order(col: string, opts: unknown) {
        calls.push({ table, method: 'order', col, val: opts })
        return q
      },
      range(from: number, to: number) {
        calls.push({ table, method: 'range', val: [from, to] })
        window = [from, to]
        return q
      },
      eq(col: string, val: unknown) {
        calls.push({ table, method: 'eq', col, val })
        rowsCol = col
        lastEq = { col, val }
        return q
      },
      is(col: string, val: unknown) {
        calls.push({ table, method: 'is', col, val })
        return q
      },
      ilike(col: string, val: unknown) {
        calls.push({ table, method: 'ilike', col, val })
        rowsCol = col
        return q
      },
      in(col: string, val: unknown) {
        calls.push({ table, method: 'in', col, val })
        rowsCol = col
        return q
      },
      maybeSingle() {
        calls.push({ table, method: 'maybeSingle', col: lastEq.col, val: lastEq.val })
        return Promise.resolve({ data: singleFor(table), error: null })
      },
      then(resolve: (v: { data: Record<string, unknown>[] | null; error: unknown }) => unknown) {
        const failAt = failFrom.get(table)
        if (failAt !== undefined && (window?.[0] ?? 0) >= failAt)
          return Promise.resolve({ data: null, error: { message: 'boom' } as unknown }).then(resolve)
        const all = rowsFor(table, rowsCol)
        const data = window ? all.slice(window[0], window[1] + 1) : all
        return Promise.resolve({ data, error: null as unknown }).then(resolve)
      },
    }
    return q
  }

  const createAdminClient = () => ({
    from(table: string) {
      return { select: () => makeQuery(table) }
    },
    auth: {
      admin: {
        getUserById(id: string) {
          calls.push({ table: 'auth.users', method: 'getUserById', col: 'id', val: id })
          return Promise.resolve({ data: { user: { id, ...authUser } }, error: null })
        },
      },
    },
  })
  return { calls, authUser, bigTables, failFrom, createAdminClient }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMemberExport,
  MEMBER_EXPORT_SECTIONS,
  EXPORT_PAGE_SIZE,
  EXPORT_READ_CEILING,
} from './export'

beforeEach(() => {
  calls.length = 0
  bigTables.clear()
  failFrom.clear()
  authUser.email = 'Me@Example.COM'
  authUser.email_confirmed_at = '2026-03-04T00:00:00Z'
})

describe('buildMemberExport — owner scoping', () => {
  it('binds every direct read to the caller id and nothing else', async () => {
    await buildMemberExport('me')
    const direct = calls.filter((c) => c.method === 'eq' || c.method === 'maybeSingle')
    expect(direct.length).toBeGreaterThan(0)
    // The whole safety contract: not one direct read filters on any value but the caller's id.
    for (const c of direct) expect(c.val).toBe('me')
  })

  it('resolves the account email only from the caller OWN profile row', async () => {
    await buildMemberExport('me')
    // The auth lookup is keyed on the auth_user_id that came back from `profiles.id = me`, so the
    // address it yields cannot be anyone else's — nothing here is caller-supplied.
    const authReads = calls.filter((c) => c.method === 'getUserById')
    expect(authReads).toHaveLength(1)
    expect(authReads[0].val).toBe('auth-me')
  })

  it('leaves exactly one non-id filter, bound to the caller OWN verified address', async () => {
    await buildMemberExport('me')
    const byEmail = calls.filter((c) => c.method === 'ilike')
    expect(byEmail).toHaveLength(1)
    expect(byEmail[0].table).toBe('event_rsvps')
    expect(byEmail[0].col).toBe('guest_email')
    // Normalised (the stored column is plain text, not citext) and matched literally, not as a
    // wildcard pattern that could span other members' addresses.
    expect(byEmail[0].val).toBe('me@example.com')
    // ...and narrowed to seats no member owns, so an email match can never reach another member's row.
    expect(calls).toContainEqual({
      table: 'event_rsvps',
      method: 'is',
      col: 'profile_id',
      val: null,
    })
  })

  it('scopes network child tables to the caller OWN contact ids (never unscoped)', async () => {
    await buildMemberExport('me')
    const childReads = calls.filter((c) => c.method === 'in')
    const tables = childReads.map((c) => c.table).sort()
    expect(tables).toEqual(['network_contact_notes', 'network_contact_tags'])
    for (const c of childReads) {
      expect(c.col).toBe('contact_id')
      expect(c.val).toEqual(['c1', 'c2'])
    }
  })
})

// LIVE-550 / ADR-1582: the six tables a member would call theirs. One case per table, each proving
// the read happens and that its only filter is the caller's id on the column that makes the row
// theirs (a message they SENT, a notification addressed TO them, and so on).
describe('buildMemberExport — the person-keyed tables (ADR-1582)', () => {
  const ownerFilters = (table: string) =>
    calls.filter((c) => c.table === table && c.method === 'eq').map((c) => [c.col, c.val])

  it('reads messages the caller SENT, never by conversation', async () => {
    await buildMemberExport('me')
    expect(ownerFilters('messages')).toEqual([['sender_id', 'me']])
  })

  it('reads room messages the caller authored', async () => {
    await buildMemberExport('me')
    expect(ownerFilters('room_messages')).toEqual([['author_id', 'me']])
  })

  it('reads friendships from both sides, each bound to the caller id', async () => {
    await buildMemberExport('me')
    expect(ownerFilters('friendships')).toEqual([
      ['user_a_id', 'me'],
      ['user_b_id', 'me'],
    ])
  })

  it('reads notifications addressed to the caller', async () => {
    await buildMemberExport('me')
    expect(ownerFilters('notifications')).toEqual([['recipient_id', 'me']])
  })

  it('reads the Spaces the caller belongs to, as a team role and as a member', async () => {
    await buildMemberExport('me')
    expect(ownerFilters('space_members')).toEqual([['profile_id', 'me']])
    expect(ownerFilters('space_memberships')).toEqual([['member_profile_id', 'me']])
  })

  it('reads the CRM activities the caller logged', async () => {
    await buildMemberExport('me')
    expect(ownerFilters('crm_activities')).toEqual([['created_by', 'me']])
  })

  it('reduces the other member to a handle and drops every profile id', async () => {
    const out = await buildMemberExport('me')
    expect(out.data.friendships).toEqual([
      expect.objectContaining({ id: 'f1', friend_handle: 'river', requested_by_me: true, introduced_by_handle: null }),
      expect.objectContaining({ id: 'f2', friend_handle: 'sky', requested_by_me: false, introduced_by_handle: 'river' }),
    ])
    for (const f of out.data.friendships) {
      for (const k of ['user_a_id', 'user_b_id', 'requested_by', 'introduced_by', 'a', 'b', 'introducer'])
        expect(f).not.toHaveProperty(k)
    }
    expect(out.data.notifications).toEqual([{ id: 'n1', type: 'friend_request', actor_handle: 'river' }])
    expect(out.data.spaceMemberships).toEqual([
      {
        id: 'ms1',
        space_id: 's2',
        status: 'active',
        space_name: 'Lantern House',
        space_slug: 'lantern-house',
        tier_name: 'Regular',
        joined_at: '2026-06-01T00:00:00Z',
      },
    ])
    expect(out.data.spaceRoles).toEqual([
      {
        id: 'sm1',
        space_id: 's1',
        role: 'member',
        space_name: 'Stillwater',
        space_slug: 'stillwater',
        joined_at: '2026-05-01T00:00:00Z',
        invited_by_handle: 'sky',
      },
    ])
  })
})

describe('buildMemberExport — the unverified-address gate (ADR-854)', () => {
  it('does not read guest seats by email when the address is unconfirmed', async () => {
    authUser.email_confirmed_at = null
    const out = await buildMemberExport('me')
    // A typed address is a claim, not an identity: someone could sign up with a stranger's address
    // and never confirm it, so this read must not happen AT ALL rather than happen and be filtered.
    expect(calls.filter((c) => c.method === 'ilike')).toHaveLength(0)
    expect(calls.some((c) => c.col === 'guest_email')).toBe(false)
    // The id-scoped seats still export — the gate costs only the unproven half.
    expect(out.data.eventRsvps.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('does not read guest seats by email when the account has no address at all', async () => {
    authUser.email = null
    await buildMemberExport('me')
    expect(calls.filter((c) => c.method === 'ilike')).toHaveLength(0)
  })
})

describe('buildMemberExport — assembled shape', () => {
  it('stamps provenance and the stable section set, and includes owned rows', async () => {
    const out = await buildMemberExport('me')
    expect(out.meta.format).toBe('frequency.member-export')
    expect(out.meta.profileId).toBe('me')
    expect(out.meta.sections).toEqual(MEMBER_EXPORT_SECTIONS)
    expect(out.meta.version).toBe(3)
    // Nothing short: an empty list is the export saying every section is whole.
    expect(out.meta.truncated).toEqual([])
    expect(out.data.profile).toEqual({ id: 'me', handle: 'me', auth_user_id: 'auth-me' })
    expect(out.data.networkContacts).toHaveLength(2)
  })

  it('merges all three RSVP reads and lists each seat once', async () => {
    const out = await buildMemberExport('me')
    // r1/r2 owned outright, r2 also returned as a claimed guest seat (deduped), r3 an UNCLAIMED
    // guest seat that neither id-scoped read can see — the gap this section exists to close.
    expect(out.data.eventRsvps.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })
})

// LIVE-626 / ADR-1599: PostgREST caps a response at max_rows (1,000), so a section read in one
// select stops at 1,000 rows and says nothing. Every multi-row read is paged, and a section that
// still stops short is named in meta.truncated instead of looking whole.
describe('buildMemberExport — paging past the 1,000-row cap (ADR-1599)', () => {
  const many = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(6, '0')}` }))
  const rangesOf = (table: string) =>
    calls.filter((c) => c.table === table && c.method === 'range').map((c) => c.val)

  it('never asks for a page larger than the server max_rows', () => {
    const config = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8')
    const maxRows = Number(/^max_rows\s*=\s*(\d+)/m.exec(config)?.[1])
    expect(maxRows).toBeGreaterThan(0)
    // A page the server caps comes back short and reads as the last one: the silent cut again.
    expect(EXPORT_PAGE_SIZE).toBeLessThanOrEqual(maxRows)
  })

  it('carries every notification of a member with 2,500, in pages, and marks nothing short', async () => {
    bigTables.set('notifications', many(2500, 'n'))
    const out = await buildMemberExport('me')
    expect(out.data.notifications).toHaveLength(2500)
    expect(new Set(out.data.notifications.map((n) => n.id)).size).toBe(2500)
    expect(rangesOf('notifications')).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    // Every page is still bound to the caller: the owner filter rides on each one.
    const filters = calls.filter((c) => c.table === 'notifications' && c.method === 'eq')
    expect(filters).toHaveLength(3)
    for (const f of filters) expect([f.col, f.val]).toEqual(['recipient_id', 'me'])
    expect(out.meta.truncated).toEqual([])
  })

  it('orders and ranges every multi-row read, and only the two keyed single rows go unpaged', async () => {
    await buildMemberExport('me')
    const filtering = ['eq', 'in', 'ilike']
    const read = new Set(calls.filter((c) => filtering.includes(c.method)).map((c) => c.table))
    const ranged = new Set(calls.filter((c) => c.method === 'range').map((c) => c.table))
    const unpaged = [...read].filter((t) => !ranged.has(t)).sort()
    expect(unpaged).toEqual(['ai_member_context', 'profiles'])
    // A stable order is what makes offsets mean anything; studio_draft has no id, so its key orders it.
    const orderOf = (t: string) => calls.find((c) => c.table === t && c.method === 'order')?.col
    expect(orderOf('studio_draft')).toBe('scope')
    expect(orderOf('notifications')).toBe('id')
  })

  it('stops at the ceiling and names the section, instead of cutting it quietly', async () => {
    bigTables.set('messages', many(EXPORT_READ_CEILING + 1, 'm'))
    const out = await buildMemberExport('me')
    expect(out.data.messages).toHaveLength(EXPORT_READ_CEILING)
    expect(out.meta.truncated).toEqual([{ section: 'messages', reason: 'ceiling' }])
  })

  it('does not call a section short when the member has exactly the ceiling', async () => {
    bigTables.set('messages', many(EXPORT_READ_CEILING, 'm'))
    const out = await buildMemberExport('me')
    expect(out.data.messages).toHaveLength(EXPORT_READ_CEILING)
    expect(out.meta.truncated).toEqual([])
  })

  it('keeps the pages it read when a later one fails, and says the section is short', async () => {
    bigTables.set('posts', many(1500, 'p'))
    failFrom.set('posts', 1000)
    const out = await buildMemberExport('me')
    expect(out.data.posts).toHaveLength(1000)
    expect(out.meta.truncated).toEqual([{ section: 'posts', reason: 'read_failed' }])
  })

  it('names a section once however many of its reads came back short', async () => {
    // eventRsvps is three reads; two failing still list the section once, in section order.
    failFrom.set('event_rsvps', 0)
    failFrom.set('crm_activities', 0)
    const out = await buildMemberExport('me')
    expect(out.meta.truncated).toEqual([
      { section: 'eventRsvps', reason: 'read_failed' },
      { section: 'crmActivities', reason: 'read_failed' },
    ])
  })
})
