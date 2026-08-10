import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ContactImportRow, ColumnMapping } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM-TARGET COMMIT + email/phone dedupe. The server graph (admin client, auth,
// store, spaces) is mocked so we exercise commit.ts's platform branch and the
// email-AND-phone dedupe end to end. The PURE dedupe (planCommit) is tested directly
// too (it is not mocked here).
// ─────────────────────────────────────────────────────────────────────────────

// Mutable fakes the mocks read (reset per test).
let existingRows: { id: string; email: string | null; meta: Record<string, unknown> | null }[] = []
let insertedRows: Record<string, unknown>[] = []
let updatedRows: { patch: Record<string, unknown>; id: string }[] = []
let staff = true
let rootId: string | null = 'root-space-id'
let importRow: ContactImportRow | null = null

// The dedupe index read is PAGED (`.eq().order().range()`), because PostgREST caps an unranged
// select at max_rows=1000 and a Space past that was silently building its index from the first
// page only — planning `create` for contacts that already existed.
//
// This mock ENFORCES THE CAP rather than merely accepting the chain: `range(from, to)` returns
// at most `PG_MAX_ROWS` rows sliced out of `existingRows`, exactly as PostgREST would. That
// distinction is the whole value of the mock — a first version returned the entire array on
// page 0, so the past-the-cap regression test passed against the single-page code it was
// written to catch, and proved nothing.
const PG_MAX_ROWS = 1000
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_col: string, _val: string) => ({
          order: (_c2: string, _o: unknown) => ({
            range: (from: number, to: number) =>
              Promise.resolve({
                data: existingRows.slice(from, Math.min(to + 1, from + PG_MAX_ROWS)),
              }),
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row)
        return Promise.resolve({ error: null })
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          eq: (_c2: string, _v: string) => {
            updatedRows.push({ patch, id })
            return Promise.resolve({ error: null })
          },
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/auth', () => ({ isPlatformStaff: () => Promise.resolve(staff) }))
vi.mock('./store', () => ({
  getImport: () => Promise.resolve(importRow),
  updateImport: () => Promise.resolve(true),
  rememberCustomFields: () => Promise.resolve(),
  getRootSpaceId: () => Promise.resolve(rootId),
}))
vi.mock('@/lib/connections/store', () => ({
  createContact: vi.fn(),
  updateContact: vi.fn(),
  existingContactKeys: vi.fn(),
  listContactsForMerge: vi.fn(),
}))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: vi.fn() }))

import { commitImport } from './commit'
import { isError } from '@/lib/action-result'
import { planCommit, type ExistingKeys } from './dedupe'
import { createContact, updateContact, existingContactKeys, listContactsForMerge } from '@/lib/connections/store'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'

function col(header: string, target: ColumnMapping['target'], customKey?: string): ColumnMapping {
  return { header, target, confidence: 1, reason: 'manual', valueType: 'text', ...(customKey ? { customKey } : {}) }
}

const MAPPING: ColumnMapping[] = [col('Name', 'displayName'), col('Email', 'email'), col('Phone', 'phone')]

function platformRow(rows: Record<string, string>[], overrides: Partial<ContactImportRow> = {}): ContactImportRow {
  return {
    id: 'imp1',
    createdBy: 'staff1',
    targetKind: 'platform',
    targetSpaceId: null,
    status: 'preview',
    filename: 'people.csv',
    source: { headers: ['Name', 'Email', 'Phone'], rows, rowCount: rows.length },
    mapping: MAPPING,
    validation: {},
    mergeStrategy: 'fill_empty',
    result: {},
    error: null,
    committedAt: null,
    createdAt: '',
    updatedAt: '',
    createdIds: [],
    rolledBackAt: null,
    ...overrides,
  }
}

function memberRow(rows: Record<string, string>[], overrides: Partial<ContactImportRow> = {}): ContactImportRow {
  return platformRow(rows, { targetKind: 'member', createdBy: 'owner1', ...overrides })
}

function spaceRow(
  headers: string[],
  mapping: ColumnMapping[],
  rows: Record<string, string>[],
  overrides: Partial<ContactImportRow> = {},
): ContactImportRow {
  return platformRow(rows, {
    targetKind: 'space',
    targetSpaceId: 'space1',
    createdBy: 'owner1',
    source: { headers, rows, rowCount: rows.length },
    mapping,
    ...overrides,
  })
}

beforeEach(() => {
  existingRows = []
  insertedRows = []
  updatedRows = []
  staff = true
  rootId = 'root-space-id'
  importRow = null
  vi.clearAllMocks()
})

describe('commitImport — platform target', () => {
  it('writes new contacts to the ROOT space as unknown/unsubscribed import leads', async () => {
    importRow = platformRow([{ Name: 'New Person', Email: 'New@X.com', Phone: '' }])
    const res = await commitImport('imp1', 'staff1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data).toMatchObject({ created: 1, merged: 0, skipped: 0, failed: 0 })
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({
      space_id: 'root-space-id',
      email: 'new@x.com', // lowercased key
      consent_state: 'unknown',
      source: 'import',
    })
  })

  it('dedupes against the platform list by BOTH email and phone', async () => {
    existingRows = [
      { id: 'c1', email: 'dup@x.com', meta: {} },
      { id: 'c2', email: 'held@x.com', meta: { phone: '(555) 123-4567' } },
    ]
    importRow = platformRow([
      { Name: 'New Person', Email: 'new@x.com', Phone: '' }, // create
      { Name: 'Dup Email', Email: 'dup@x.com', Phone: '' }, // merge by email -> c1
      { Name: 'Phone Match', Email: 'phoneonly@x.com', Phone: '555-123-4567' }, // merge by phone -> c2
      { Name: 'Repeat', Email: 'new@x.com', Phone: '' }, // internal dup -> skip
    ])
    const res = await commitImport('imp1', 'staff1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data).toMatchObject({ created: 1, merged: 2, skipped: 1, failed: 0, total: 4 })
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({ email: 'new@x.com' })
    // The phone-matched row resolved to the existing c2 row (not a failed lookup).
    expect(updatedRows.map((u) => u.id).sort()).toEqual(['c1', 'c2'])
  })

  it('dedupes against a contact PAST the 1000-row PostgREST page cap', async () => {
    // The bug this locks: the dedupe index read had no `.range()`, and PostgREST caps an
    // unranged select at max_rows=1000 SERVER-SIDE (service_role does not escape it). So a
    // Space with more than 1000 contacts built its index from the first page only, contact
    // 1001+ looked absent, and re-importing an established list silently duplicated every row
    // past the cap — corrupting exactly the customer data the CRM exists to hold.
    //
    // 1500 existing rows; the import re-adds one that lives at index 1200, well past page 0.
    // With a single-page read this asserts created: 1 / merged: 0 and fails.
    existingRows = Array.from({ length: 1500 }, (_, i) => ({
      id: `c${i}`,
      email: `person${i}@x.com`,
      meta: {} as Record<string, unknown>,
    }))
    importRow = platformRow([{ Name: 'Way Past The Cap', Email: 'person1200@x.com', Phone: '' }])

    const res = await commitImport('imp1', 'staff1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data).toMatchObject({ created: 0, merged: 1, skipped: 0, failed: 0, total: 1 })
    expect(insertedRows).toHaveLength(0)
    expect(updatedRows.map((u) => u.id)).toEqual(['c1200'])
  })

  it('refuses when the caller is not platform staff (membrane / gate)', async () => {
    staff = false
    importRow = platformRow([{ Name: 'X', Email: 'x@x.com', Phone: '' }])
    const res = await commitImport('imp1', 'member1')
    expect(isError(res)).toBe(true)
    expect(insertedRows).toHaveLength(0)
  })

  it('refuses when the root space cannot be resolved (fail-safe, no wrong-scope write)', async () => {
    rootId = null
    importRow = platformRow([{ Name: 'X', Email: 'x@x.com', Phone: '' }])
    const res = await commitImport('imp1', 'staff1')
    expect(isError(res)).toBe(true)
    expect(insertedRows).toHaveLength(0)
  })

  it('is idempotent: a committed row returns its stored result without re-writing', async () => {
    importRow = platformRow([{ Name: 'X', Email: 'x@x.com', Phone: '' }], {
      status: 'committed',
      result: { created: 5, merged: 0, skipped: 0, failed: 0, total: 5 },
    })
    const res = await commitImport('imp1', 'staff1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data.created).toBe(5)
    expect(insertedRows).toHaveLength(0)
  })
})

describe('commitImport — member target (id-resolution cohort)', () => {
  it('resolves a planned merge against the FULL contact cohort, not a capped page', async () => {
    // The plan dedupes against existingContactKeys (UNBOUNDED). The id-resolution map must read the
    // SAME full cohort (listContactsForMerge, uncapped) — a contact that would fall past a page cap
    // still resolves, so its row merges instead of being miscounted as failed.
    vi.mocked(existingContactKeys).mockResolvedValue({ emails: new Set(['far@x.com']), phones: new Set() })
    vi.mocked(listContactsForMerge).mockResolvedValue([
      { id: 'far1', displayName: 'Far Away', email: 'far@x.com', phone: null, title: null, company: null, city: null, website: null, details: {} },
    ])
    vi.mocked(updateContact).mockResolvedValue(true)
    vi.mocked(createContact).mockResolvedValue('new1')

    importRow = memberRow([
      { Name: 'Far Away Updated', Email: 'far@x.com', Phone: '' }, // merge -> far1
      { Name: 'Brand New', Email: 'new@x.com', Phone: '' }, // create
    ])
    const res = await commitImport('imp1', 'owner1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    expect(res.data).toMatchObject({ created: 1, merged: 1, skipped: 0, failed: 0, total: 2 })
    expect(vi.mocked(updateContact).mock.calls[0]?.[1]).toBe('far1')
  })
})

describe('commitImport — Space target (preview/commit parity for phone-only rows)', () => {
  const NAME_PHONE: ColumnMapping[] = [col('Name', 'displayName'), col('Phone', 'phone')]

  it('skips a Name,Phone (email-less) row, and the preview count matches that commit', async () => {
    vi.mocked(getSpaceById).mockResolvedValue({ id: 'space1' } as never)
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ role: 'owner' } as never)
    vi.mocked(spaceFunctionAccess).mockReturnValue(true)

    const rows: Record<string, string>[] = [
      { Name: 'Phone Only', Phone: '555-111-2222' }, // no email -> skipped at commit
      { Name: 'Has Email', Phone: '555-333-4444', Email: 'has@x.com' }, // Email col not mapped below
    ]
    // Only Name + Phone are mapped (a classic "Name,Phone" import), so neither row has an email key.
    importRow = spaceRow(['Name', 'Phone'], NAME_PHONE, rows)
    const res = await commitImport('imp1', 'owner1')
    expect(isError(res)).toBe(false)
    if (isError(res)) return
    // Both rows are email-less -> both skipped at commit; nothing inserted.
    expect(res.data).toMatchObject({ created: 0, merged: 0, skipped: 2, failed: 0, total: 2 })
    expect(insertedRows).toHaveLength(0)

    // The dry-run preview uses planCommit with requireEmail=true for a Space target. Its counts must
    // equal the commit outcome (no "created" that later becomes "skipped").
    const preview = planCommit(rows, NAME_PHONE, { emails: new Set(), phones: new Set() }, 'fill_empty', {
      requireEmail: true,
    })
    expect(preview.diff.created).toBe(res.data.created)
    expect(preview.diff.skipped).toBe(res.data.skipped)
  })
})

describe('planCommit — email AND phone dedupe (pure)', () => {
  const MAP: ColumnMapping[] = [col('Email', 'email'), col('Phone', 'phone')]
  const rows = (r: Record<string, string>[]) => r

  it('skips an internal duplicate that repeats a phone under a different email', () => {
    const plan = planCommit(
      rows([
        { Email: 'a@x.com', Phone: '555-000-1111' },
        { Email: 'b@x.com', Phone: '(555) 000-1111' }, // same last-10 phone -> internal skip
      ]),
      MAP,
      { emails: new Set(), phones: new Set() },
      'fill_empty',
    )
    expect(plan.diff).toMatchObject({ created: 1, skipped: 1 })
  })

  it('merges against an existing PHONE key even when the email is new', () => {
    const existing: ExistingKeys = { emails: new Set(['known@x.com']), phones: new Set(['5550001111']) }
    const plan = planCommit(rows([{ Email: 'fresh@x.com', Phone: '555-000-1111' }]), MAP, existing, 'fill_empty')
    expect(plan.diff).toMatchObject({ created: 0, merged: 1 })
  })

  it('merges against an existing EMAIL key even when the phone is new', () => {
    const existing: ExistingKeys = { emails: new Set(['known@x.com']), phones: new Set() }
    const plan = planCommit(rows([{ Email: 'known@x.com', Phone: '555-999-8888' }]), MAP, existing, 'fill_empty')
    expect(plan.diff).toMatchObject({ created: 0, merged: 1 })
  })
})
