import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Pins the calendar suite pass 2 shape in the files that carry it. The database half (constraints
// and RLS under real roles) is supabase/tests/calendar_suite_data_model.test.sql, run by db-tests.

const ROOT = join(import.meta.dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const SQL = read('supabase/migrations/20270346027000_calendar_suite_data_model.sql')
const CAL = 'app/(main)/spaces/[slug]/settings/calendar/'

describe('20270346027000_calendar_suite_data_model.sql', () => {
  it('is additive and idempotent: no drop table or column in the forward path', () => {
    const forward = SQL.split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
    expect(forward).not.toMatch(/drop\s+(table|column)/i)
    expect(forward).not.toMatch(/add\s+column\s+(?!if not exists)/i)
  })

  it('adds the three to-do columns with their checks', () => {
    expect(SQL).toMatch(/add column if not exists phase text\s+check \(phase is null or phase in \('before', 'day_of', 'after'\)\)/)
    expect(SQL).toMatch(/add column if not exists est_minutes integer\s+check \(est_minutes is null or est_minutes >= 0\)/)
    expect(SQL).toMatch(/add column if not exists start_minute smallint\s+check \(start_minute is null or start_minute between 0 and 1439\)/)
  })

  it('adds hold_until to space_plans and no stored team list', () => {
    expect(SQL).toMatch(/alter table public\.space_plans\s+add column if not exists hold_until date/)
    expect(SQL).not.toMatch(/add column[^;]*team_profile_ids/)
  })

  it('gives both record tables an entry subject with a one-subject check and an FK index', () => {
    for (const t of ['space_plan_activity', 'space_plan_comments']) {
      expect(SQL).toContain(`${t}_one_subject`)
      expect(SQL).toMatch(
        new RegExp(`alter table public\\.${t}\\s+add column if not exists entry_id uuid references public\\.space_calendar_entries\\(id\\) on delete cascade`),
      )
      expect(SQL).toMatch(new RegExp(`create index if not exists ${t}_entry_idx`))
    }
    expect(SQL).toContain('check (num_nonnulls(plan_id, entry_id) = 1)')
  })

  it('widens read and insert through a SECURITY DEFINER boolean, with no direct read of another RLS table', () => {
    expect(SQL).toMatch(/function private\.can_write_entry\(p_entry_id uuid, p_space_id uuid default null\)\s+returns boolean[\s\S]*security definer/)
    expect(SQL).toMatch(/revoke all on function private\.can_write_entry\(uuid, uuid\) from public, anon/)
    const policies = SQL.slice(SQL.lastIndexOf('drop policy if exists space_plan_comments_read'))
    expect(policies).not.toMatch(/from public\./)
    expect(policies).not.toMatch(/\bexists\s*\(/i)
    for (const p of ['space_plan_comments_read', 'space_plan_comments_insert', 'space_plan_activity_read', 'space_plan_activity_insert']) {
      expect(policies).toContain(`create policy ${p}`)
    }
  })

  it('adds no update or delete policy to the record tables', () => {
    expect(SQL).not.toMatch(/create policy \w+\s+on public\.space_plan_(comments|activity)\s+for (update|delete)/)
  })
})

describe('the calendar server doors', () => {
  it('every calendar action file gates on the events function switch', () => {
    for (const f of ['task-actions.ts', 'plan-actions.ts', 'entry-actions.ts', 'entry-record-actions.ts']) {
      expect(read(`${CAL}${f}`), f).toContain("spaceFunctionAccess(space, 'events', caps.role)")
    }
  })

  it('the entry record doors refuse an entry that is on a Plan', () => {
    expect(read(`${CAL}entry-record-actions.ts`)).toMatch(/if \(entry\.plan_id\) return \{ error:/)
  })
})
