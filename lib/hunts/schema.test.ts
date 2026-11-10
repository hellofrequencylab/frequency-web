// FH-005 source-shape guard for supabase/migrations/20270346031000_hunts_schema.sql.
// It cannot prove the SQL runs (supabase/tests/hunts_schema.test.sql does that under pgTAP); it
// proves a later edit has not dropped the properties the schema exists for.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join('supabase', 'migrations', '20270346031000_hunts_schema.sql'), 'utf8')
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

const TABLES = [
  'hunts',
  'hunt_versions',
  'hunt_roles',
  'hunt_partners',
  'hunt_missions',
  'hunt_rule_groups',
  'hunt_rule_group_members',
  'hunt_nodes',
  'hunt_placements',
  'hunt_mission_placements',
]

describe('Hunts schema (FH-005)', () => {
  it.each(TABLES)('%s is service role only', (t) => {
    expect(code).toContain(`create table if not exists public.${t} (`)
    expect(code).toContain(`alter table public.${t} enable row level security;`)
    expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`)
    expect(code).toContain(`grant all on public.${t} to service_role;`)
  })

  it('creates no policy, so the browser has no way in', () => {
    expect(code).not.toContain('create policy')
  })

  it('a Hunt has exactly one owner', () => {
    expect(code).toContain('num_nonnulls(owner_profile_id, owner_space_id) = 1')
  })

  it('children are tied to their own Hunt by composite foreign keys', () => {
    expect(code).toContain('foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id)')
    expect(code).toContain('foreign key (id, current_version_id) references public.hunt_versions(hunt_id, id)')
    expect(code).toContain('foreign key (placement_id, hunt_id) references public.hunt_placements(id, hunt_id)')
  })

  it('a published version needs a content hash', () => {
    expect(code).toContain(
      "status not in ('published','superseded') or (content_hash is not null and published_at is not null)",
    )
  })

  it('does not touch the older Regulars hunts', () => {
    expect(code).not.toMatch(/loyalty_hunt/)
  })
})
