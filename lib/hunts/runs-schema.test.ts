// FH-006 source-shape guard for supabase/migrations/20270346032000_hunt_runs.sql. The SQL itself is
// run by supabase/tests/hunt_runs.test.sql under pgTAP; this keeps a later edit from dropping the keys.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join('supabase', 'migrations', '20270346032000_hunt_runs.sql'), 'utf8')
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

const TABLES = ['hunt_runs', 'hunt_claims', 'hunt_progress', 'hunt_command_keys', 'hunt_audit', 'hunt_compensations']

describe('Hunt runs schema (FH-006)', () => {
  it.each(TABLES)('%s is service role only', (t) => {
    expect(code).toContain(`create table if not exists public.${t} (`)
    expect(code).toContain(`alter table public.${t} enable row level security;`)
    expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`)
    expect(code).toContain(`grant all on public.${t} to service_role;`)
  })

  it('creates no policy', () => {
    expect(code).not.toContain('create policy')
  })

  it('credits once per run and mission', () => {
    expect(code).toContain('primary key (run_id, mission_key)')
  })

  it('a replayed proof cannot add a claim', () => {
    expect(code).toContain('unique (run_id, mission_key, evidence_id)')
  })

  it('a command key is unique per actor, action and key', () => {
    expect(code).toContain('primary key (actor_profile_id, action, idempotency_key)')
    expect(code).toContain('request_hash text not null')
  })

  it('children are tied to their own Hunt and run', () => {
    expect(code).toContain('foreign key (run_id, hunt_id) references public.hunt_runs(id, hunt_id)')
    expect(code).toContain('foreign key (credited_claim_id, run_id) references public.hunt_claims(id, run_id)')
    expect(code).toContain('foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id)')
  })
})
