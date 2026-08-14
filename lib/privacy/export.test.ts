import { describe, it, expect, vi, beforeEach } from 'vitest'

// The security contract for the member export: EVERY read is bound to the caller's own
// profile id, the network child tables are bound to the caller's OWN contact ids, and the one
// read that filters on an email instead of an id is bound to the caller's own VERIFIED account
// address (ADR-854) — it must not fire at all for an unconfirmed address. A recorder mock captures
// every filter the builder applies so we can prove no query is unscoped (the admin client bypasses
// RLS, so these in-code filters ARE the access control).

type Call = { table: string; method: string; col?: string; val?: unknown }
const { calls, authUser, createAdminClient } = vi.hoisted(() => {
  const calls: Call[] = []
  // Mutable so a test can drop the caller's address to unconfirmed and assert the gate holds.
  const authUser: { email: string | null; email_confirmed_at: string | null } = {
    // Deliberately mixed-case: the guest-seat read must normalise before matching.
    email: 'Me@Example.COM',
    email_confirmed_at: '2026-03-04T00:00:00Z',
  }
  // network_contacts returns two owned rows so the child (.in) reads are exercised. The three
  // event_rsvps reads return DIFFERENT (overlapping) seats so the merge + dedupe is exercised too.
  const rowsFor = (table: string, col?: string): Record<string, unknown>[] => {
    if (table === 'network_contacts') return [{ id: 'c1' }, { id: 'c2' }]
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
  const makeQuery = (table: string) => {
    let rowsCol: string | undefined
    let lastEq: { col?: string; val?: unknown } = {}
    const q = {
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
      then(resolve: (v: { data: Record<string, unknown>[]; error: unknown }) => unknown) {
        return Promise.resolve({ data: rowsFor(table, rowsCol), error: null as unknown }).then(resolve)
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
  return { calls, authUser, createAdminClient }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { buildMemberExport, MEMBER_EXPORT_SECTIONS } from './export'

beforeEach(() => {
  calls.length = 0
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
