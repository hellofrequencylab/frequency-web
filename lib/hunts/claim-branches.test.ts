// FH-042 at the claim door: an exclusive choice raced from two devices, and a Mystery answer.
// The database here is a fake that keeps state and copies the two things the real one does for this
// path: hunt_claim_apply's progress-count check (FH-049T, taken under the run lock in SQL) and the
// one-row-per-(run, mission, evidence) key on hunt_claims. The SQL itself is proved by
// supabase/tests/hunt_claim_progress_guard.test.sql and hunt_runs.test.sql, not here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const rpc = vi.fn()
const inserts = vi.fn()
const selects = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let matches = tables[table] ?? []
      const query = {
        select: (columns: string) => { selects(table, columns); return query },
        order: () => query,
        eq: (column: string, value: unknown) => { matches = matches.filter((row) => row[column] === value); return query },
        in: (column: string, values: unknown[]) => { matches = matches.filter((row) => values.includes(row[column])); return query },
        like: (column: string, pattern: string) => { matches = matches.filter((row) => String(row[column]).startsWith(pattern.replace('%', ''))); return query },
        limit: (n: number) => { matches = matches.slice(0, n); return query },
        maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
        then: (resolve: (r: { data: Row[]; count: number; error: null }) => unknown) => resolve({ data: matches, count: matches.length, error: null }),
        insert: async (row: Row) => {
          inserts(table, row)
          const rows = (tables[table] ??= [])
          // unique (run_id, mission_key, evidence_id)
          if (rows.some((r) => r.run_id === row.run_id && r.mission_key === row.mission_key && r.evidence_id === row.evidence_id)) return { error: { code: '23505', message: 'duplicate key' } }
          rows.push({ ...row, correct: String((row.policy_result as { correct?: boolean }).correct) })
          return { error: null }
        },
      }
      return query
    },
    rpc,
  }),
}))

import { signingSecret } from '@/lib/signing-secret'
import { claimAsPlayer } from './claim-store'
import { hashAnswer } from './mystery'
import { issueClaimToken } from './placement'

const NOW = 1_800_000_000
const HASH = hashAnswer('lighthouse')

/** hunt_claim_apply as far as this path needs it: the count check, one credit per mission, one more progress row. */
function fakeClaimApply(_fn: string, args: Record<string, unknown>) {
  const progress = (tables.hunt_progress ??= [])
  const mine = progress.filter((p) => p.run_id === args.p_run_id)
  if (args.p_expected_progress_count !== null && mine.length !== args.p_expected_progress_count) return Promise.resolve({ data: { result: 'stale_progress' }, error: null })
  if (mine.some((p) => p.mission_key === args.p_mission_key)) return Promise.resolve({ data: { result: 'already_credited' }, error: null })
  progress.push({ run_id: args.p_run_id, mission_key: args.p_mission_key, disposition: 'credited', accepted_at: new Date(1_800_000_000_000 + progress.length).toISOString() })
  return Promise.resolve({ data: { result: 'credited', claim_id: `c-${progress.length}` }, error: null })
}

const mission = (mission_key: string, extra: Row = {}) => ({ version_id: 'v-1', mission_key, title: mission_key, visible_body: null, locked_teaser: null, opens_at: null, closes_at: null, kind: 'visit', choice_group: null, fallback_group: null, ...extra })

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  vi.stubEnv('HUNTS_PROOF_SECRET', 'test-proof-secret')
  rpc.mockImplementation(fakeClaimApply)
  Object.assign(tables, {
    hunts: [{ id: 'h-1', slug: 'fork', status: 'live', visibility: 'public', current_version_id: 'v-1', revision: 1 }],
    hunt_versions: [{ id: 'v-1', hunt_id: 'h-1', status: 'published', trail_title: 'Fork', trail_hook: null }],
    hunt_runs: [{ id: 'run-1', hunt_id: 'h-1', version_id: 'v-1', subject_profile_id: 'me', state: 'active' }],
    hunt_placements: ['river', 'ridge', 'riddle', 'desk', 'end'].map((k) => ({ id: `pl-${k}`, hunt_id: 'h-1', medium: 'qr', revoked_at: null })),
    hunt_mission_placements: ['river', 'ridge', 'riddle', 'desk', 'end'].map((k) => ({ hunt_id: 'h-1', version_id: 'v-1', mission_key: k, placement_id: `pl-${k}`, venue_space_id: null })),
    // Choose the river or the ridge; then a Mystery with a staffed desk as its fallback; then the end.
    hunt_missions: [
      mission('river', { choice_group: 'way' }),
      mission('ridge', { choice_group: 'way' }),
      mission('riddle', { kind: 'answer', fallback_group: 'riddle', answer_hash: HASH, locked_teaser: 'It guides ships.' }),
      mission('desk', { fallback_group: 'riddle' }),
      mission('end'),
    ],
    hunt_rule_groups: [
      { id: 'g-riddle', version_id: 'v-1', target_mission_key: 'riddle', target_finish: false, logic: 'any', min_count: null, group_key: null },
      { id: 'g-desk', version_id: 'v-1', target_mission_key: 'desk', target_finish: false, logic: 'any', min_count: null, group_key: null },
      { id: 'g-end', version_id: 'v-1', target_mission_key: 'end', target_finish: false, logic: 'all', min_count: null, group_key: null },
      { id: 'g-finish', version_id: 'v-1', target_mission_key: null, target_finish: true, logic: 'all', min_count: null, group_key: null },
    ],
    hunt_rule_group_members: [
      ...['g-riddle', 'g-desk'].flatMap((group_id) => ['river', 'ridge'].map((member_mission_key) => ({ group_id, version_id: 'v-1', member_mission_key }))),
      { group_id: 'g-end', version_id: 'v-1', member_mission_key: 'riddle' },
      { group_id: 'g-finish', version_id: 'v-1', member_mission_key: 'end' },
    ],
    hunt_progress: [],
    hunt_claims: [],
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  for (const k of Object.keys(tables)) delete tables[k]
  rpc.mockReset()
  inserts.mockClear()
  selects.mockClear()
})

function claim(stop: string, answer?: string, key = `key-${stop}-${answer ?? ''}`) {
  const secret = signingSecret('hunt-claim-proof', ['HUNTS_PROOF_SECRET'])
  const token = issueClaimToken({ secret, scope: { runId: 'run-1', placementId: `pl-${stop}` }, now: NOW })
  return claimAsPlayer('me', { placementId: `pl-${stop}`, token, idempotencyKey: key, nowEpoch: NOW + 1, ...(answer === undefined ? {} : { answer }) })
}
const credit = (...keys: string[]) => keys.forEach((mission_key, i) => tables.hunt_progress.push({ run_id: 'run-1', mission_key, disposition: 'credited', accepted_at: new Date(1_799_999_000_000 + i).toISOString() }))
const attempts = () => tables.hunt_claims.filter((c) => String(c.evidence_id).startsWith('answer:'))

describe('an exclusive choice at the claim door', () => {
  it('accepts one branch when both are claimed at once', async () => {
    const [river, ridge] = await Promise.all([claim('river'), claim('ridge')])
    const outcomes = [river, ridge].map((o) => (o.ok ? o.result : o.reason)).sort()
    expect(outcomes).toEqual(['credited', 'mission_not_eligible'])
    expect(tables.hunt_progress.map((p) => p.mission_key)).toHaveLength(1)
    // It was a real race: both requests evaluated the same empty snapshot and both reached the database.
    expect(rpc.mock.calls.map((c) => (c[1] as Row).p_expected_progress_count)).toEqual([0, 0])
  })

  it('refuses the other branch afterwards without asking the database, and again on every retry', async () => {
    expect(await claim('ridge')).toMatchObject({ ok: true, result: 'credited' })
    expect(await claim('river')).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(await claim('river', undefined, 'another-key')).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(rpc).toHaveBeenCalledOnce()
    expect(await claim('ridge')).toEqual({ ok: true, result: 'already_credited', replayed: false })
  })

  it('reads a second credit that reached the table anyway as closed: the earlier branch stays the choice', async () => {
    credit('river', 'ridge')
    expect(await claim('ridge')).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(await claim('river')).toEqual({ ok: true, result: 'already_credited', replayed: false })
  })
})

describe('a Mystery answer at the claim door', () => {
  it('costs no attempt while the stop is locked', async () => {
    expect(await claim('riddle', 'lighthouse')).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(inserts).not.toHaveBeenCalled()
  })

  it('asks for an answer, and an empty one costs no attempt', async () => {
    credit('river')
    expect(await claim('riddle')).toEqual({ ok: false, reason: 'answer_required' })
    expect(await claim('riddle', '   ')).toEqual({ ok: false, reason: 'answer_required' })
    expect(attempts()).toHaveLength(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('credits the right answer through the same claim command', async () => {
    credit('river')
    expect(await claim('riddle', ' Lighthouse ')).toMatchObject({ ok: true, result: 'credited' })
    expect(rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({ p_mission_key: 'riddle', p_expected_progress_count: 1 }))
    expect(attempts()).toHaveLength(1)
  })

  it('counts wrong guesses down, gives the hint from the second, then locks for good', async () => {
    credit('river')
    expect(await claim('riddle', 'a boat')).toEqual({ ok: false, reason: 'answer_wrong', attemptsLeft: 4 })
    expect(await claim('riddle', 'a buoy')).toEqual({ ok: false, reason: 'answer_wrong', attemptsLeft: 3, hint: 'It guides ships.' })
    await claim('riddle', 'a star')
    await claim('riddle', 'a map')
    expect(await claim('riddle', 'a pilot')).toEqual({ ok: false, reason: 'answer_locked', attemptsLeft: 0, hint: 'It guides ships.' })
    // Locked: the right answer is no longer judged, and no sixth attempt is recorded.
    expect(await claim('riddle', 'lighthouse')).toEqual({ ok: false, reason: 'answer_locked', attemptsLeft: 0, hint: 'It guides ships.' })
    expect(attempts().map((a) => a.evidence_id)).toEqual(['answer:1', 'answer:2', 'answer:3', 'answer:4', 'answer:5'])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('leaves the alternative path open after a lockout, and the run can finish through it', async () => {
    credit('river')
    for (const guess of ['1', '2', '3', '4', '5']) await claim('riddle', guess)
    expect(await claim('desk')).toMatchObject({ ok: true, result: 'credited' })
    expect(await claim('end')).toMatchObject({ ok: true, result: 'credited' })
    // The answer closed when its fallback was credited.
    expect(await claim('riddle', 'lighthouse')).toEqual({ ok: false, reason: 'mission_not_eligible' })
  })

  it('judges one guess per attempt number when several arrive at once, and drops the rest unseen', async () => {
    credit('river')
    const guesses = ['a boat', 'lighthouse', 'a buoy', 'a star', 'a map', 'a pilot', 'a rock', 'a bell']
    const out = await Promise.all(guesses.map((g) => claim('riddle', g)))
    expect(attempts()).toHaveLength(1)
    // The one recorded guess was wrong, so the right guess in the same burst learned nothing and earned nothing.
    expect(out.filter((o) => !o.ok && o.reason === 'answer_wrong')).toHaveLength(1)
    expect(out.filter((o) => !o.ok && o.reason === 'eligibility_unavailable')).toHaveLength(guesses.length - 1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never stores the guess and never returns the hash', async () => {
    credit('river')
    const wrong = await claim('riddle', 'a secret guess')
    const right = await claim('riddle', 'lighthouse')
    expect(JSON.stringify([wrong, right])).not.toContain(HASH)
    expect(JSON.stringify(tables.hunt_claims)).not.toMatch(/secret guess|lighthouse/)
    expect(attempts().map((a) => a.policy_result)).toEqual([
      { kind: 'answer_attempt', attempt: 1, correct: false },
      { kind: 'answer_attempt', attempt: 2, correct: true },
    ])
    // Only the judge reads answer_hash; the trail a player view is built from never selects it.
    const hashReads = selects.mock.calls.filter(([, columns]) => String(columns).includes('answer_hash'))
    expect(hashReads.every(([table, columns]) => table === 'hunt_missions' && columns === 'answer_hash, locked_teaser')).toBe(true)
    expect(hashReads.length).toBe(2)
  })

  it('does not ask again, or spend an attempt, when a correct answer is retried', async () => {
    credit('river')
    rpc.mockImplementationOnce(async () => ({ data: { result: 'stale_progress' }, error: null }))
    rpc.mockImplementationOnce(async () => ({ data: { result: 'stale_progress' }, error: null }))
    expect(await claim('riddle', 'lighthouse')).toMatchObject({ ok: true, result: 'stale_progress' })
    expect(attempts()).toHaveLength(1)
    // The retry carries no answer at all: the recorded correct attempt stands.
    expect(await claim('riddle', undefined, 'retry-key')).toMatchObject({ ok: true, result: 'credited' })
    expect(attempts()).toHaveLength(1)
  })

  it('fails closed when the mission has no stored answer', async () => {
    credit('river')
    tables.hunt_missions = tables.hunt_missions.map((m) => (m.mission_key === 'riddle' ? { ...m, answer_hash: null } : m))
    expect(await claim('riddle', 'lighthouse')).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    expect(inserts).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
