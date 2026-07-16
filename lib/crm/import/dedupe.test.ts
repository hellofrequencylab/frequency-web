import { describe, it, expect } from 'vitest'
import {
  emailKey,
  phoneKey,
  splitTags,
  projectRow,
  validateRow,
  isImportable,
  planCommit,
  toValidationResult,
  type ExistingKeys,
} from './dedupe'
import type { ColumnMapping } from './types'

function col(header: string, target: ColumnMapping['target'], customKey?: string): ColumnMapping {
  return { header, target, confidence: 1, reason: 'manual', valueType: 'text', ...(customKey ? { customKey } : {}) }
}

const MAPPING: ColumnMapping[] = [
  col('Name', 'displayName'),
  col('Email', 'email'),
  col('Phone', 'phone'),
  col('Company', 'company'),
  col('Tags', 'tags'),
  col('Lead Source', 'custom', 'lead_source'),
]

const NO_EXISTING: ExistingKeys = { emails: new Set(), phones: new Set() }

describe('emailKey / phoneKey', () => {
  it('lowercases + trims email', () => {
    expect(emailKey('  Sarah@X.COM ')).toBe('sarah@x.com')
    expect(emailKey('')).toBeNull()
  })
  it('takes the last 10 phone digits', () => {
    expect(phoneKey('+1 (555) 123-4567')).toBe('5551234567')
    expect(phoneKey('555-1234')).toBe('5551234')
    expect(phoneKey('abc')).toBeNull()
  })
})

describe('splitTags', () => {
  it('splits on comma/semicolon/pipe and dedupes', () => {
    expect(splitTags('vip, Investor; vip | yoga')).toEqual(['vip', 'Investor', 'yoga'])
  })
})

describe('projectRow', () => {
  it('projects named fields + custom + tags', () => {
    const c = projectRow(
      { Name: 'Sarah Kim', Email: 'SARAH@X.com', Phone: '(555) 123-4567', Company: 'Acme', Tags: 'vip,investor', 'Lead Source': 'expo' },
      MAPPING,
    )
    expect(c.displayName).toBe('Sarah Kim')
    expect(c.email).toBe('sarah@x.com')
    expect(c.phone).toBe('(555) 123-4567')
    expect(c.company).toBe('Acme')
    expect(c.tags).toEqual(['vip', 'investor'])
    expect(c.custom).toEqual({ lead_source: 'expo' })
  })
  it('concatenates two displayName columns (first + last)', () => {
    const m = [col('First', 'displayName'), col('Last', 'displayName')]
    const c = projectRow({ First: 'Sarah', Last: 'Kim' }, m)
    expect(c.displayName).toBe('Sarah Kim')
  })
  it('ignores columns mapped to ignore', () => {
    const m = [col('Name', 'displayName'), col('Junk', 'ignore')]
    const c = projectRow({ Name: 'A', Junk: 'x' }, m)
    expect(c.custom).toEqual({})
  })
})

describe('validateRow', () => {
  it('flags a row with no identity', () => {
    const c = projectRow({ Company: 'Acme' }, [col('Company', 'company')])
    const errs = validateRow(c, 0)
    expect(errs).toHaveLength(1)
    expect(errs[0].field).toBe('row')
    expect(isImportable(c)).toBe(false)
  })
  it('flags a malformed email but keeps the row importable', () => {
    const c = projectRow({ Name: 'A', Email: 'not-an-email' }, [col('Name', 'displayName'), col('Email', 'email')])
    const errs = validateRow(c, 3)
    expect(errs.some((e) => e.field === 'email')).toBe(true)
    expect(isImportable(c)).toBe(true)
  })
  it('passes a clean row', () => {
    const c = projectRow({ Name: 'A', Email: 'a@b.com' }, [col('Name', 'displayName'), col('Email', 'email')])
    expect(validateRow(c, 0)).toEqual([])
  })
})

describe('planCommit', () => {
  it('creates new rows and reports the diff', () => {
    const rows = [
      { Name: 'A', Email: 'a@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' },
      { Name: 'B', Email: 'b@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' },
    ]
    const plan = planCommit(rows, MAPPING, NO_EXISTING, 'fill_empty')
    expect(plan.diff.created).toBe(2)
    expect(plan.diff.merged).toBe(0)
    expect(plan.customKeys).toContain('lead_source')
  })
  it('dedupes WITHIN the file (first wins)', () => {
    const rows = [
      { Name: 'A', Email: 'dup@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' },
      { Name: 'A2', Email: 'DUP@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' },
    ]
    const plan = planCommit(rows, MAPPING, NO_EXISTING, 'fill_empty')
    expect(plan.diff.created).toBe(1)
    expect(plan.diff.skipped).toBe(1)
  })
  it('merges against an existing contact under fill_empty', () => {
    const existing: ExistingKeys = { emails: new Set(['known@x.com']), phones: new Set() }
    const rows = [{ Name: 'A', Email: 'known@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' }]
    const plan = planCommit(rows, MAPPING, existing, 'fill_empty')
    expect(plan.diff.merged).toBe(1)
    expect(plan.rows[0].action).toBe('merge')
    expect(plan.rows[0].matchedKey).toBe('known@x.com')
  })
  it('skips an existing match under the skip strategy', () => {
    const existing: ExistingKeys = { emails: new Set(['known@x.com']), phones: new Set() }
    const rows = [{ Name: 'A', Email: 'known@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' }]
    const plan = planCommit(rows, MAPPING, existing, 'skip')
    expect(plan.diff.merged).toBe(0)
    expect(plan.diff.skipped).toBe(1)
  })
  it('dedupes by phone when email is absent', () => {
    const existing: ExistingKeys = { emails: new Set(), phones: new Set(['5551234567']) }
    const rows = [{ Name: 'A', Email: '', Phone: '+1 (555) 123-4567', Company: '', Tags: '', 'Lead Source': '' }]
    const plan = planCommit(rows, MAPPING, existing, 'overwrite')
    expect(plan.diff.merged).toBe(1)
  })
  it('skips + flags a row with no identity', () => {
    const rows = [{ Name: '', Email: '', Phone: '', Company: 'Acme', Tags: '', 'Lead Source': '' }]
    const plan = planCommit(rows, MAPPING, NO_EXISTING, 'fill_empty')
    expect(plan.diff.skipped).toBe(1)
    expect(plan.diff.flagged).toBe(1)
  })
  it('drops a malformed email so it never dedupes or persists', () => {
    const rows = [{ Name: 'A', Email: 'bad', Phone: '', Company: '', Tags: '', 'Lead Source': '' }]
    const plan = planCommit(rows, MAPPING, NO_EXISTING, 'fill_empty')
    expect(plan.diff.created).toBe(1)
    expect(plan.rows[0].contact.email).toBe('')
    expect(plan.diff.flagged).toBe(1)
  })
})

describe('toValidationResult', () => {
  it('surfaces a per-row preview from the SAME plan (create/merge + matchedKey + error)', () => {
    const existing: ExistingKeys = { emails: new Set(['known@x.com']), phones: new Set() }
    const rows = [
      { Name: 'New', Email: 'new@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' },
      { Name: 'Known', Email: 'known@x.com', Phone: '', Company: '', Tags: '', 'Lead Source': '' },
      { Name: '', Email: '', Phone: '', Company: 'Acme', Tags: '', 'Lead Source': '' }, // no identity -> skip + flag
    ]
    const plan = planCommit(rows, MAPPING, existing, 'fill_empty')
    const v = toValidationResult(plan)

    // Row list and the totals come from the same plan, so they never diverge.
    expect(v.rowTotal).toBe(3)
    expect(v.rows).toHaveLength(3)
    const created = v.rows!.filter((r) => r.action === 'create').length
    const merged = v.rows!.filter((r) => r.action === 'merge').length
    const skipped = v.rows!.filter((r) => r.action === 'skip').length
    expect({ created, merged, skipped }).toEqual({
      created: v.diff.created,
      merged: v.diff.merged,
      skipped: v.diff.skipped,
    })

    expect(v.rows![0]).toMatchObject({ action: 'create', name: 'New', email: 'new@x.com', matchedKey: null, error: null })
    expect(v.rows![1]).toMatchObject({ action: 'merge', matchedKey: 'known@x.com' })
    expect(v.rows![2].action).toBe('skip')
    expect(v.rows![2].error).toBeTruthy()
  })
})
