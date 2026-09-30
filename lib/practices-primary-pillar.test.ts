import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-650 (ADR-1618): A PRACTICE'S MAIN PILLAR IS `domain_id`, NEVER "THE FIRST FOCUS".
//
// practices.focus_details is jsonb, and jsonb keeps no key order: Postgres stores object keys by
// length and then bytewise, so a map read back from the row lists its Pillars in id order, not the
// order the author chose them. updatePractice used to set domain_id to the first key of whatever
// focus_details map it was handed, so a save that round-tripped a stored map (the Studio, or any
// caller that edits one Focus's instructions) moved the main Pillar to the Pillar whose id sorts
// first, and with it the Zap split (LIVE-641) and the per-Pillar attribution (LIVE-642).
//
// These tests drive the REAL updatePractice against a mocked database and assert on the UPDATE
// PAYLOAD, the consequence: what lands in `domain_id`. Every map is handed in EVERY key order, so a
// rule that reads key order fails here whichever order it happens to prefer.

const MIND = '11111111-1111-4111-8111-111111111111'
const BODY = '22222222-2222-4222-8222-222222222222'
const SPIRIT = '33333333-3333-4333-8333-333333333333'

type Focus = Record<string, { instructions: string; timing: string }>

interface Row {
  domain_id: string | null
  secondary_domain_id: string | null
  primary_pct: number
  focus_details: Focus
  [k: string]: unknown
}

let row: Row
let updatePayload: Record<string, unknown> | null = null

/** A map the way Postgres hands jsonb back: keys by length, then bytewise. */
function asJsonb(map: Focus): Focus {
  const keys = Object.keys(map).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(keys.map((k) => [k, map[k]]))
}

/** Every ordering of a map's keys, as distinct objects. */
function orderings(map: Focus): Focus[] {
  const permute = (keys: string[]): string[][] =>
    keys.length <= 1 ? [keys] : keys.flatMap((k, i) => permute([...keys.slice(0, i), ...keys.slice(i + 1)]).map((rest) => [k, ...rest]))
  return permute(Object.keys(map)).map((keys) => Object.fromEntries(keys.map((k) => [k, map[k]])))
}

function builder() {
  let mode: 'read' | 'write' = 'read'
  let payload: Record<string, unknown> | null = null
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    update(p: Record<string, unknown>) {
      mode = 'write'
      payload = p
      updatePayload = p
      return api
    },
    async maybeSingle() {
      // A read returns the stored row, its Focus map in jsonb order; the write returns it as saved.
      const stored = { ...row, focus_details: asJsonb(row.focus_details) }
      return { data: mode === 'write' ? { ...stored, ...payload } : stored, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))
vi.mock('@/lib/practices/embeddings', () => ({ embedPractice: async () => {} }))

const { updatePractice } = await import('./practices')

const F = (instructions = '') => ({ instructions, timing: '' })

beforeEach(() => {
  updatePayload = null
  // BODY is the primary, and MIND's id sorts first: the stored map reads back MIND-first.
  row = {
    domain_id: BODY,
    secondary_domain_id: null,
    primary_pct: 75,
    focus_details: { [BODY]: F('Stretch'), [MIND]: F('Sit') },
  }
})

describe('updatePractice keeps the main Pillar in domain_id, whatever order the Focus keys arrive in (LIVE-650)', () => {
  it('the premise: the stored map reads back with a key that is not the primary first', () => {
    expect(Object.keys(asJsonb(row.focus_details))[0]).toBe(MIND)
    expect(row.domain_id).toBe(BODY)
  })

  it('editing one Focus of a map read back from the row keeps the primary, in every key order', async () => {
    const edited = { ...asJsonb(row.focus_details), [MIND]: F('Sit for ten breaths') }
    for (const map of orderings(edited)) {
      await updatePractice('p-1', { focus_details: map })
      expect(updatePayload?.domain_id).toBe(BODY)
      expect(updatePayload?.focus_details).toEqual(edited)
    }
  })

  it('adding a Focus keeps the primary, in every key order', async () => {
    const added = { ...row.focus_details, [SPIRIT]: F() }
    for (const map of orderings(added)) {
      await updatePractice('p-1', { focus_details: map })
      expect(updatePayload?.domain_id).toBe(BODY)
    }
  })

  it('a primary named in the same patch wins while it is one of the Focuses, in every key order', async () => {
    const map = { ...row.focus_details, [SPIRIT]: F() }
    for (const ordered of orderings(map)) {
      await updatePractice('p-1', { domain_id: SPIRIT, focus_details: ordered })
      expect(updatePayload?.domain_id).toBe(SPIRIT)
    }
  })

  it('the split survives: a secondary whose id sorts first is not turned into the primary', async () => {
    row.secondary_domain_id = MIND
    row.primary_pct = 60
    for (const map of orderings({ ...row.focus_details, [MIND]: F('Sit longer') })) {
      await updatePractice('p-1', { focus_details: map })
      expect(updatePayload?.domain_id).toBe(BODY)
      expect(updatePayload?.secondary_domain_id).toBe(MIND)
      expect(updatePayload?.primary_pct).toBe(60)
    }
  })

  it('only a primary that LEFT the set is replaced, by the first Focus of the map as handed', async () => {
    await updatePractice('p-1', { focus_details: { [SPIRIT]: F(), [MIND]: F() } })
    expect(updatePayload?.domain_id).toBe(SPIRIT)
    await updatePractice('p-1', { focus_details: { [MIND]: F(), [SPIRIT]: F() } })
    expect(updatePayload?.domain_id).toBe(MIND)
  })

  it('a row with no primary yet (a new practice) takes the first Focus the author chose', async () => {
    row.domain_id = null
    row.focus_details = {}
    await updatePractice('p-1', { focus_details: { [SPIRIT]: F(), [MIND]: F() } })
    expect(updatePayload?.domain_id).toBe(SPIRIT)
  })

  it('an empty Focus set clears the primary', async () => {
    await updatePractice('p-1', { focus_details: {} })
    expect(updatePayload?.domain_id).toBeNull()
  })
})
