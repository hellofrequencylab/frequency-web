import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findings, MIN_TABLES } from '../maintenance/live-catalog.mjs'

const sql = readFileSync(new URL('./secure-frequency-backups.sql', import.meta.url), 'utf8')
const expectedTargets = [
  'zz_backup_alli_rae_20261027',
  'zz_backup_alli_rae_rename_20261027',
  'zz_backup_alli_rae_update2_20261027',
  'zz_backup_alli_rae_update3_20261027',
  'zz_backup_alli_rae_update_20261027',
  'zz_backup_group_event_owner_20261020',
  'zz_backup_hof_theme_drafts_20261027',
  'zz_backup_house_of_fates_update_20261027',
  'zz_backup_temple_home_20261022',
  'zz_hof_stage_20261027',
].sort()

function targetNames() {
  const match = /target_names\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/i.exec(sql)
  if (!match) throw new Error('repair SQL is missing its explicit target_names allowlist')
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, name]) => name).sort()
}

describe('secure-frequency-backups operator repair', () => {
  it('keeps an explicit, exact allowlist of the two existing and eight reviewed backups', () => {
    expect(targetNames()).toEqual(expectedTargets)
  })

  it('covers every target in the live catalog guard with both expected findings', () => {
    const backups = targetNames().map((name) => ({
      name,
      rls: false,
      browser_table_grant: true,
      browser_column_grant: true,
    }))
    const unrelated = Array.from({ length: MIN_TABLES }, (_, index) => ({
      name: `ordinary_${index}`,
      rls: true,
      browser_table_grant: false,
      browser_column_grant: false,
    }))
    const found = findings([...unrelated, ...backups])
    expect(found).toHaveLength(expectedTargets.length * 2)
    for (const name of expectedTargets) {
      expect(found.filter((finding) => finding.table === name).map((finding) => finding.rule).sort())
        .toEqual(['backup-grants', 'rls-off'])
    }
  })

  it('fails closed on missing targets, enforces RLS and checks effective table and column grants', () => {
    expect(sql).toMatch(/if\s+missing_names\s+is\s+not\s+null\s+then[\s\S]*?raise exception[\s\S]*?rolling back/i)
    expect(sql).toMatch(/alter table %I\.%I enable row level security/i)
    expect(sql).toMatch(/revoke all privileges on table %I\.%I from public, anon, authenticated/i)
    expect(sql).toMatch(/revoke all privileges \(%s\) on table %I\.%I from public, anon, authenticated/i)
    expect(sql).toMatch(/has_table_privilege[\s\S]*?MAINTAIN/i)
    expect(sql).toMatch(/has_any_column_privilege[\s\S]*?SELECT,INSERT,UPDATE,REFERENCES/i)
    expect(sql).toMatch(/found_count\s*<>\s*cardinality\(target_names\)/i)
  })

  it('compares service-role and operator effective rights before and after each repair', () => {
    expect(sql).toMatch(/array\['service_role',\s*current_user::text\]/i)
    expect(sql).toMatch(/protected_access_before\s+jsonb/i)
    expect(sql).toMatch(/protected_access_after\s+jsonb/i)
    expect(sql).toMatch(/protected_access_after\s+is\s+distinct\s+from\s+protected_access_before[\s\S]*?rolling back/i)
    for (const privilege of ['table_select', 'table_insert', 'table_update', 'table_delete', 'table_truncate', 'table_references', 'table_trigger', 'table_maintain', 'column_select', 'column_insert', 'column_update', 'column_references']) {
      expect(sql).toContain(`'${privilege}'`)
    }
  })

  it('preserves backup rows and never grants or revokes service/operator access', () => {
    const executable = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .toLowerCase()
    expect(executable).not.toMatch(/\b(drop\s+table|truncate\s+table|delete\s+from|insert\s+into|update\s+[a-z_]+\s+set\b)/)
    expect(executable).not.toMatch(/\b(?:grant|revoke)\b[^;]*\bservice_role\b/)
    expect(executable).toContain('begin;')
    expect(executable).toContain('commit;')
  })
})
