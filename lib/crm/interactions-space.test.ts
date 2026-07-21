import { describe, it, expect, vi, beforeEach } from 'vitest'

// Space-scoped interaction behavior (ADR-796): the "log every activity" helper writes a profile-subject
// touch STAMPED with the space id, and the person-stitch read applies a STRICT per-space filter so one
// Space never sees another party's touches. Both are exercised against a chain-recording admin mock.

type Rec = { table: string; op: string; row?: Record<string, unknown>; filters: [string, string][] }
let calls: Rec[] = []

function builder(table: string) {
  const rec: Rec = { table, op: 'select', filters: [] }
  calls.push(rec)
  const api = {
    select() { return api },
    insert(rows: Record<string, unknown>[]) { rec.op = 'insert'; rec.row = rows[0]; return api },
    upsert(rows: Record<string, unknown>[]) { rec.op = 'upsert'; rec.row = rows[0]; return api },
    in(col: string, vals: string[]) { rec.filters.push(['in:' + col, vals.join(',')]); return api },
    eq(col: string, val: string) { rec.filters.push([col, val]); return api },
    order() { return api },
    async limit() { return { data: [], error: null } },
    async maybeSingle() { return { data: { id: 'row-1' }, error: null } },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { recordSpaceMemberActivity, listInteractionsForPerson } from './interactions'

beforeEach(() => { calls = [] })

describe('recordSpaceMemberActivity', () => {
  it('writes a profile-subject touch stamped with the space id and source=engagement', async () => {
    await recordSpaceMemberActivity({
      spaceId: 'space-1',
      spaceOwnerProfileId: 'owner-1',
      memberProfileId: 'member-1',
      channel: 'event',
      summary: 'Reserved a spot: Sunset Yoga',
      idempotencyKey: 'rsvp:space-1:tier-1:member-1',
    })
    const write = calls.find((c) => c.op === 'insert' || c.op === 'upsert')
    expect(write).toBeTruthy()
    expect(write!.row).toMatchObject({
      owner_profile_id: 'owner-1',
      subject_kind: 'profile',
      subject_id: 'member-1',
      channel: 'event',
      source: 'engagement',
      space_id: 'space-1',
      idempotency_key: 'rsvp:space-1:tier-1:member-1',
    })
  })

  it('no-ops (no DB write) when the space owner or member is missing', async () => {
    await recordSpaceMemberActivity({ spaceId: 'space-1', spaceOwnerProfileId: null, memberProfileId: 'm', channel: 'event', summary: 's', idempotencyKey: 'k' })
    await recordSpaceMemberActivity({ spaceId: 'space-1', spaceOwnerProfileId: 'o', memberProfileId: null, channel: 'event', summary: 's', idempotencyKey: 'k' })
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })
})

describe('listInteractionsForPerson — tenancy scope', () => {
  it('applies a STRICT space_id filter when a spaceId is passed', async () => {
    await listInteractionsForPerson(['contact-1', 'profile-1'], 50, 'space-1')
    const read = calls.find((c) => c.table === 'contact_interactions')
    expect(read!.filters).toContainEqual(['in:subject_id', 'contact-1,profile-1'])
    expect(read!.filters).toContainEqual(['space_id', 'space-1'])
  })

  it('reads GLOBALLY (no space_id filter) when no spaceId is passed — the admin person view', async () => {
    await listInteractionsForPerson(['profile-1', 'contact-1'], 50)
    const read = calls.find((c) => c.table === 'contact_interactions')
    expect(read!.filters.some(([c]) => c === 'space_id')).toBe(false)
  })

  it('returns [] for an empty id set without touching the db', async () => {
    const out = await listInteractionsForPerson([null, undefined, ''], 50, 'space-1')
    expect(out).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
