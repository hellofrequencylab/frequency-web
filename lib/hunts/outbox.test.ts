// FH-009: the worker helpers, plus a source-shape guard on the migration so a later edit cannot drop
// the lease fence, the receipt keys or the dead-letter path. The queue itself is proved under pgTAP
// by supabase/tests/hunt_outbox.test.sql.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backoffSeconds, semanticKey } from './outbox'

const sql = readFileSync(join('supabase', 'migrations', '20270346036000_hunt_outbox.sql'), 'utf8')
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

describe('backoffSeconds', () => {
  it('doubles from five seconds and caps at an hour', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([5, 10, 20, 40])
    expect(backoffSeconds(0)).toBe(5)
    expect(backoffSeconds(30)).toBe(3600)
  })

  it('matches the formula in the migration', () => {
    expect(code).toContain('least(3600, 5 * power(2, greatest(p_attempts - 1, 0)))')
  })
})

describe('semanticKey', () => {
  const base = { consumer: 'crm', huntId: 'h1', subject: 'p1', effect: 'upsert' }
  it('names the effect, so a retry and a replay share one key', () => {
    expect(semanticKey(base)).toBe(semanticKey({ ...base }))
    expect(semanticKey(base)).toBe('crm:h1:p1:upsert:once')
    expect(semanticKey({ ...base, scope: 'space-a' })).not.toBe(semanticKey(base))
  })
  it('keeps the key free of separators and bounded', () => {
    const k = semanticKey({ ...base, subject: 'a:b c/d'.repeat(30) })
    expect(k.split(':')).toHaveLength(5)
    expect(k.length).toBeLessThanOrEqual(5 * 60 + 4)
  })
})

describe('Hunt outbox migration (FH-009)', () => {
  it.each(['hunt_outbox', 'hunt_deliveries'])('%s is service role only', (t) => {
    expect(code).toContain(`create table if not exists public.${t} (`)
    expect(code).toContain(`alter table public.${t} enable row level security;`)
    expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`)
    expect(code).toContain(`grant all on public.${t} to service_role;`)
  })
  it('creates no policy', () => {
    expect(code).not.toContain('create policy')
  })
  it('keeps one row per consumer and event, and one receipt per effect', () => {
    expect(code).toContain('unique (consumer, event_id)')
    expect(code).toContain('unique (consumer, semantic_key)')
  })
  it('fences completion and failure on the lease token', () => {
    expect(code.match(/lease_token is distinct from p_lease_token/g)?.length).toBe(2)
    expect(code).toContain("then\n    return 'stale_lease'")
  })
  it('leases with skip locked and dead-letters past the cap', () => {
    expect(code).toContain('for update skip locked')
    expect(code).toContain("set status = 'dead'")
  })
  it.each(['hunt_outbox_backoff(integer)', 'hunt_outbox_lease(text, integer, integer)', 'hunt_outbox_complete(uuid, uuid, text)', 'hunt_outbox_fail(uuid, uuid, text)', 'hunt_outbox_replay(uuid, uuid, text, integer)'])(
    '%s is executable by the service role only',
    (f) => {
      expect(code).toContain(`revoke all on function public.${f} from public, anon, authenticated;`)
      expect(code).toContain(`grant execute on function public.${f} to service_role;`)
    },
  )
})
