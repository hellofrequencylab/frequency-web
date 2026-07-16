import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE DASHBOARD MEMBER-LIST READER (Resonance Engine Phase 2 · ADR-383). Locks the LIST-FIRST
// front door (docs/NEXT-GEN-CRM.md): listAllScoredMembers / listMembersByFilter({ kind: 'all' })
// returns EVERY scored member, lowest health first, with NO column filter (the `all` roster does
// not call .eq()), while a tier / lifecycle drill still filters. FAIL-SAFE: any read error or an
// invalid filter resolves to an empty list, never a throw.

// ── A chainable admin-client mock over the member_engagement_scores matview ───────────────────────
// scores[] is the matview; contacts[] stitches names. The mock records whether .eq() was applied so
// the test can prove the `all` roster skips the column filter.
type ScoreRow = {
  profile_id: string
  resonance_health: number | null
  resonance_tier: string | null
  lifecycle_stage: string | null
}
type ContactRow = { id: string; profile_id: string | null; display_name: string | null; email: string }

const db: { scores: ScoreRow[]; contacts: ContactRow[]; throwOnScores: boolean } = {
  scores: [],
  contacts: [],
  throwOnScores: false,
}
const eqCalls: Array<[string, unknown]> = []

function scoresBuilder() {
  let eqCol: string | null = null
  let eqVal: string | null = null
  let asc = true
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqCalls.push([col, val])
      eqCol = col
      eqVal = val
      return api
    },
    order(_col: string, o: { ascending: boolean }) {
      asc = o.ascending
      return api
    },
    limit() {
      if (db.throwOnScores) return Promise.resolve({ data: null, error: new Error('matview missing') })
      let rows = [...db.scores]
      if (eqCol && eqVal != null) {
        const key = eqCol === 'resonance_tier' ? 'resonance_tier' : 'lifecycle_stage'
        rows = rows.filter((r) => r[key as keyof ScoreRow] === eqVal)
      }
      rows.sort((a, b) => ((a.resonance_health ?? 0) - (b.resonance_health ?? 0)) * (asc ? 1 : -1))
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

function contactsBuilder() {
  const api = {
    select() {
      return api
    },
    // .not('profile_id','is',null) — the completeness union's member-universe read (chainable).
    not() {
      return api
    },
    limit() {
      return Promise.resolve({ data: db.contacts.filter((c) => c.profile_id), error: null })
    },
    in(_col: string, ids: string[]) {
      return Promise.resolve({ data: db.contacts.filter((c) => c.profile_id && ids.includes(c.profile_id)), error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'contacts' ? contactsBuilder() : scoresBuilder()),
  }),
}))

import { listAllScoredMembers, listMembersByFilter } from './scores'

beforeEach(() => {
  db.scores = [
    { profile_id: 'p-low', resonance_health: 10, resonance_tier: 'at_risk', lifecycle_stage: 'dormant' },
    { profile_id: 'p-mid', resonance_health: 50, resonance_tier: 'cooling', lifecycle_stage: 'engaged' },
    { profile_id: 'p-high', resonance_health: 90, resonance_tier: 'resonant', lifecycle_stage: 'engaged' },
  ]
  db.contacts = [
    { id: 'c-low', profile_id: 'p-low', display_name: 'Ada Low', email: 'ada@example.com' },
    { id: 'c-mid', profile_id: 'p-mid', display_name: null, email: 'mid@example.com' },
    // p-high has no contact row: it should still appear, just without a contactId.
  ]
  db.throwOnScores = false
  eqCalls.length = 0
})

describe('listAllScoredMembers (the list-first front door)', () => {
  it('returns every scored member, lowest health first, with no column filter', async () => {
    const rows = await listAllScoredMembers()
    expect(rows.map((r) => r.profileId)).toEqual(['p-low', 'p-mid', 'p-high'])
    // The `all` roster must NOT filter by a tier / lifecycle column.
    expect(eqCalls.some(([col]) => col === 'resonance_tier' || col === 'lifecycle_stage')).toBe(false)
  })

  it('stitches names + a contact id, and keeps a member with no stitched contact', async () => {
    const rows = await listAllScoredMembers()
    const low = rows.find((r) => r.profileId === 'p-low')!
    expect(low.name).toBe('Ada Low')
    expect(low.contactId).toBe('c-low')
    // No display name falls back to the email local part.
    expect(rows.find((r) => r.profileId === 'p-mid')!.name).toBe('mid')
    // No contact row at all still lists the member (null contactId), never dropped.
    const high = rows.find((r) => r.profileId === 'p-high')!
    expect(high.contactId).toBeNull()
    expect(high.name).toBe('This member')
  })

  it('is the same as listMembersByFilter({ kind: all })', async () => {
    const viaWrapper = await listAllScoredMembers()
    const viaFilter = await listMembersByFilter({ kind: 'all' })
    expect(viaFilter.map((r) => r.profileId)).toEqual(viaWrapper.map((r) => r.profileId))
  })

  it('fails safe to an empty list when the matview is absent', async () => {
    db.throwOnScores = true
    expect(await listAllScoredMembers()).toEqual([])
  })

  it('surfaces a brand-new member missing from the matview (completeness union)', async () => {
    // p-new has a profile-linked contact but no score row yet (joined since the nightly refresh).
    db.contacts = [
      ...db.contacts,
      { id: 'c-new', profile_id: 'p-new', display_name: 'New Member', email: 'new@example.com' },
    ]
    const rows = await listAllScoredMembers()
    expect(rows.map((r) => r.profileId)).toContain('p-new') // appears despite no matview row
    const nu = rows.find((r) => r.profileId === 'p-new')!
    expect(nu.lifecycleStage).toBe('new') // labeled new, not defaulted to at_risk
    expect(nu.name).toBe('New Member')
  })
})

describe('listMembersByFilter drill-downs still filter', () => {
  it('a tier drill applies the resonance_tier column', async () => {
    const rows = await listMembersByFilter({ kind: 'tier', value: 'at_risk' })
    expect(rows.map((r) => r.profileId)).toEqual(['p-low'])
    expect(eqCalls).toContainEqual(['resonance_tier', 'at_risk'])
  })

  it('a lifecycle drill applies the lifecycle_stage column, lowest health first', async () => {
    const rows = await listMembersByFilter({ kind: 'lifecycle', value: 'engaged' })
    expect(rows.map((r) => r.profileId)).toEqual(['p-mid', 'p-high'])
    expect(eqCalls).toContainEqual(['lifecycle_stage', 'engaged'])
  })

  it('rejects an invalid filter value with an empty list (no column injection)', async () => {
    // @ts-expect-error testing the runtime guard against an out-of-domain tier value
    expect(await listMembersByFilter({ kind: 'tier', value: 'bogus' })).toEqual([])
  })
})
