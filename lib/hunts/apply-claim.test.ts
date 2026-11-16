// FH-010: the request hash, the answer narrowing, and a source-shape guard on the migration so a later
// edit cannot drop the run lock, the idempotency serialisation, the outbox write or the browser-role
// revoke. The transaction itself is proved under pgTAP by supabase/tests/hunt_claim_apply.test.sql.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyClaim, claimRequestHash } from './apply-claim'

const base = {
  actorId: 'a1',
  runId: 'r1',
  missionKey: 'shop-a',
  placementId: 'p1',
  evidenceId: 'ev-1',
  assurance: 'signed_node' as const,
}

describe('claimRequestHash', () => {
  it('is stable for one payload and changes with any field', () => {
    expect(claimRequestHash(base)).toBe(claimRequestHash({ ...base }))
    expect(claimRequestHash(base)).toMatch(/^[0-9a-f]{64}$/)
    for (const change of [{ runId: 'r2' }, { missionKey: 'x' }, { placementId: 'p2' }, { evidenceId: 'ev-2' }, { assurance: 'staff' as const }]) {
      expect(claimRequestHash({ ...base, ...change })).not.toBe(claimRequestHash(base))
    }
  })
})

describe('applyClaim', () => {
  const input = { ...base, idempotencyKey: 'key-0000001' }

  it('passes the hash and key to the database and narrows the answer', async () => {
    let seen: Record<string, unknown> = {}
    const out = await applyClaim(
      async (_fn, args) => {
        seen = args
        return { data: { result: 'credited', claim_id: 'c1' }, error: null }
      },
      input,
    )
    expect(out).toEqual({ result: 'credited', claimId: 'c1', replayed: false })
    expect(seen.p_request_hash).toBe(claimRequestHash(base))
    expect(seen.p_idempotency_key).toBe('key-0000001')
  })

  it('sends the expected progress count, or null when the caller has none, and keeps it out of the request hash', async () => {
    const seen: Record<string, unknown>[] = []
    const rpc = async (_fn: string, args: Record<string, unknown>) => {
      seen.push(args)
      return { data: { result: 'stale_progress' }, error: null }
    }
    expect(await applyClaim(rpc, { ...input, expectedProgressCount: 3 })).toEqual({ result: 'stale_progress', claimId: undefined, replayed: false })
    await applyClaim(rpc, input)
    expect(seen[0].p_expected_progress_count).toBe(3)
    expect(seen[1].p_expected_progress_count).toBeNull()
    expect(seen[0].p_request_hash).toBe(seen[1].p_request_hash)
  })

  it('accepts a held answer', async () => {
    const out = await applyClaim(async () => ({ data: { result: 'held', claim_id: 'c9' }, error: null }), input)
    expect(out).toEqual({ result: 'held', claimId: 'c9', replayed: false })
  })

  it('reports a replay', async () => {
    const out = await applyClaim(async () => ({ data: { result: 'credited', replayed: true }, error: null }), input)
    expect(out.replayed).toBe(true)
  })

  it('throws on a database error and on an answer it does not know', async () => {
    await expect(applyClaim(async () => ({ data: null, error: { message: 'boom' } }), input)).rejects.toThrow('boom')
    await expect(applyClaim(async () => ({ data: { result: 'maybe' }, error: null }), input)).rejects.toThrow('does not know')
  })
})

describe('the progress guard migration', () => {
  const code = readFileSync(join('supabase', 'migrations', '20270346052000_hunt_claim_progress_guard.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase()

  it('replaces the old signature, counts under the run lock before any write, and stays service role only', () => {
    expect(code).toContain('drop function if exists public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text)')
    expect(code).toContain('p_expected_progress_count integer default null')
    expect(code.indexOf('for update')).toBeLessThan(code.indexOf('stale_progress'))
    expect(code.indexOf('stale_progress')).toBeLessThan(code.indexOf('insert into public.hunt_claims'))
    expect(code).toContain('revoke all on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) from public, anon, authenticated')
    expect(code).toContain('grant execute on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) to service_role')
  })
})

describe('the held claim migration', () => {
  const code = readFileSync(join('supabase', 'migrations', '20270346053000_hunt_claim_hold.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase()

  it('keeps the default refusal, holds only on an opted-in binding, and writes no progress or outbox for a hold', () => {
    expect(code).toContain("return jsonb_build_object('result', 'assurance_too_low')")
    expect(code).toContain("evidence_policy -> 'hold_for_review' = 'true'::jsonb")
    const hold = code.slice(code.indexOf("'needs_review'"), code.indexOf("return answer;"))
    expect(hold).not.toContain('hunt_progress')
    expect(hold).not.toContain('hunt_outbox')
    expect(code).not.toContain('drop function')
    expect(code).toContain('grant execute on function public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer) to service_role')
  })
})

describe('the migration', () => {
  const code = readFileSync(join('supabase', 'migrations', '20270346037000_hunt_claim_apply.sql'), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase()

  it('locks the run, serialises the key, writes the outbox and closes the browser roles out', () => {
    expect(code).toContain('for update')
    expect(code).toContain('pg_advisory_xact_lock')
    expect(code).toContain('insert into public.hunt_outbox')
    expect(code).toContain('insert into public.hunt_audit')
    expect(code).toContain('revoke all on function public.hunt_claim_apply')
    expect(code).toContain('from public, anon, authenticated')
  })
})
