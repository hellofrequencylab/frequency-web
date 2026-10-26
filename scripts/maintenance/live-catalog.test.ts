import { describe, expect, it } from 'vitest'
import { BACKUP_SHAPE, findings, formatReport, MIN_TABLES, parseCatalog } from './live-catalog.mjs'

const t = (name: string, rls = true, table = false, column = false) => ({ name, rls, browser_table_grant: table, browser_column_grant: column })
const base = () => Array.from({ length: MIN_TABLES }, (_, i) => t(`table_${i}`))

describe('live-catalog', () => {
  it('is clean on a healthy catalog', () => {
    expect(findings(base())).toEqual([])
  })

  it('flags RLS off, except the accepted extension table', () => {
    const rows = [...base(), t('spatial_ref_sys', false), t('orders_x', false)]
    expect(findings(rows).map((f) => f.table)).toEqual(['orders_x'])
  })

  it('flags a backup table that still grants to the browser roles, by table or by column', () => {
    const rows = [...base(), t('zz_backup_temple_home_20261022', true, true), t('group_backup_2026', true, false, true), t('zz_backup_safe', true)]
    expect(findings(rows).map((f) => f.table)).toEqual(['zz_backup_temple_home_20261022', 'group_backup_2026'])
  })

  it('does not take ordinary names for backups', () => {
    for (const n of ['backups_policy', 'profiles', 'space_old']) expect(BACKUP_SHAPE.test(n)).toBe(false)
    for (const n of ['zz_backup_x', 'events_bak', 'events_backup_1', 'x_old_y']) expect(BACKUP_SHAPE.test(n)).toBe(true)
  })

  it('treats a tiny read as broken, and an API error as a throw', () => {
    expect(() => findings([t('a')])).toThrow(/broken read/)
    expect(() => parseCatalog({ message: 'denied' })).toThrow(/failed/)
    expect(parseCatalog({ result: base() })).toHaveLength(MIN_TABLES)
  })

  it('prints a one-line clean report', () => {
    expect(formatReport([], 300)).toMatch(/no findings/)
  })
})
