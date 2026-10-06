import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-662: a segment's field template, which contacts it applies to, and the Space-scoped save.

const state = vi.hoisted(() => ({
  editor: true as boolean,
  contact: { id: 'c1', meta: { acquisition: 'qr', custom: { shirt: 'M', legacy: 'x' } } } as Record<string, unknown> | null,
  segments: [] as Record<string, unknown>[],
  recipients: {} as Record<string, { contactId: string; email: string }[]>,
  updates: [] as { table: string; patch: Record<string, unknown>; eqs: [string, string][] }[],
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => (state.editor ? 'p1' : null) }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => ({ id: 's1' }) }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: state.editor }) }))
vi.mock('@/lib/spaces/audiences', () => ({
  resolveAudience: async (_s: string, f: { segmentId: string }) => state.recipients[f.segmentId] ?? [],
}))
vi.mock('@/lib/crm/import/store', () => ({
  listSpaceCustomFields: async () => [
    { key: 'shirt', label: 'Shirt size', valueType: 'select', options: ['S', 'M', 'L'], fingerprint: null },
    { key: 'joined', label: 'Joined', valueType: 'date', fingerprint: null },
    { key: 'legacy', label: 'Legacy', valueType: 'text', fingerprint: null },
  ],
  rememberCustomFields: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const eqs: [string, string][] = []
      let patch: Record<string, unknown> | null = null
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        limit: () => q,
        neq: () => q,
        eq: (c: string, v: string) => {
          eqs.push([c, v])
          return q
        },
        update: (p: Record<string, unknown>) => {
          patch = p
          return q
        },
        maybeSingle: async () => {
          if (patch) {
            state.updates.push({ table, patch, eqs })
            return { data: { id: 'x' }, error: null }
          }
          return { data: table === 'contacts' ? state.contact : null, error: null }
        },
        then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve({ data: state.segments, error: null })),
      }
      return q
    },
  }),
}))

import {
  normalizeFieldKeys,
  normalizeCustomValue,
  mergeCustomValues,
  templateFieldsForContact,
  saveContactCustomFields,
  setSegmentFieldKeys,
} from './segment-fields'

beforeEach(() => {
  state.editor = true
  state.contact = { id: 'c1', meta: { acquisition: 'qr', custom: { shirt: 'M', legacy: 'x' } } }
  state.segments = [
    { id: 'seg-a', name: 'Volunteers', field_keys: ['shirt', 'joined'] },
    { id: 'seg-b', name: 'Donors', field_keys: ['joined'] },
    { id: 'seg-c', name: 'Empty', field_keys: [] },
  ]
  state.recipients = { 'seg-a': [{ contactId: 'c1', email: 'a@x.co' }], 'seg-b': [{ contactId: 'c2', email: 'b@x.co' }] }
  state.updates = []
})

describe('normalizeFieldKeys', () => {
  it('keeps known keys once, in order, capped at 20', () => {
    const known = new Set(Array.from({ length: 30 }, (_, i) => `k${i}`))
    expect(normalizeFieldKeys(['k1', 'nope', 'k1', 'k2', 7], known)).toEqual(['k1', 'k2'])
    expect(normalizeFieldKeys([...known], known)).toHaveLength(20)
    expect(normalizeFieldKeys('k1', known)).toEqual([])
  })
})

describe('normalizeCustomValue', () => {
  const f = (valueType: string, options?: string[]) => ({ label: 'Field', valueType: valueType as never, options })
  it('clears on blank and checks each type', () => {
    expect(normalizeCustomValue('  ', f('text'))).toBeNull()
    expect(normalizeCustomValue('1,200', f('number'))).toBe('1200')
    expect(normalizeCustomValue('abc', f('number'))).toEqual({ error: 'Field needs a number.' })
    expect(normalizeCustomValue('2026-02-30', f('date'))).toEqual({ error: 'Field needs a date.' })
    expect(normalizeCustomValue('2026-02-28', f('date'))).toBe('2026-02-28')
    expect(normalizeCustomValue('Yes', f('boolean'))).toBe('true')
    expect(normalizeCustomValue('frequency.com', f('url'))).toBe('https://frequency.com/')
    expect(normalizeCustomValue('javascript:alert(1)', f('url'))).toEqual({ error: 'Field needs a web address.' })
    expect(normalizeCustomValue('m', f('select', ['S', 'M']))).toBe('M')
    expect(normalizeCustomValue('XL', f('select', ['S', 'M']))).toEqual({ error: 'Field needs one of: S, M.' })
  })
})

describe('mergeCustomValues', () => {
  it('writes allowed keys only, and a blank removes one', () => {
    const allowed = new Map([
      ['a', { label: 'A', valueType: 'text' as const }],
      ['b', { label: 'B', valueType: 'text' as const }],
    ])
    expect(mergeCustomValues({ a: '1', b: '2', z: '9' }, { a: 'new', b: '', z: 'hack', q: 'no' }, allowed)).toEqual({
      custom: { a: 'new', z: '9' },
    })
  })
})

describe('templateFieldsForContact', () => {
  it('unions the templates of the segments the contact is in, by the send resolver', async () => {
    const fields = await templateFieldsForContact('s1', 'c1')
    expect(fields.map((x) => [x.key, x.segments])).toEqual([
      ['shirt', ['Volunteers']],
      ['joined', ['Volunteers']],
    ])
  })

  it('is empty for a contact in no templated segment', async () => {
    expect(await templateFieldsForContact('s1', 'c9')).toEqual([])
  })
})

describe('saveContactCustomFields', () => {
  it('saves template and existing keys, keeps the rest of meta, binds the Space', async () => {
    const r = await saveContactCustomFields('s1', 'c1', { shirt: 'l', joined: '2026-01-05', legacy: '', other: 'nope' })
    expect(r).toEqual({ data: undefined })
    expect(state.updates).toHaveLength(1)
    const u = state.updates[0]
    expect(u.table).toBe('contacts')
    expect(u.eqs).toEqual([
      ['id', 'c1'],
      ['space_id', 's1'],
    ])
    expect(u.patch.meta).toEqual({ acquisition: 'qr', custom: { shirt: 'L', joined: '2026-01-05' } })
  })

  it('refuses a non-editor and writes nothing', async () => {
    state.editor = false
    const r = await saveContactCustomFields('s1', 'c1', { shirt: 'S' })
    expect('error' in r).toBe(true)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses a contact outside the Space', async () => {
    state.contact = null
    expect(await saveContactCustomFields('s1', 'c1', { shirt: 'S' })).toEqual({ error: 'That contact is not in this space.' })
  })

  it('returns the type error and writes nothing', async () => {
    const r = await saveContactCustomFields('s1', 'c1', { joined: 'soon' })
    expect(r).toEqual({ error: 'Joined needs a date.' })
    expect(state.updates).toHaveLength(0)
  })
})

describe('setSegmentFieldKeys', () => {
  it('stores only this Space registry keys, bound to the Space', async () => {
    await setSegmentFieldKeys('s1', 'seg-a', ['joined', 'bogus', 'shirt'])
    expect(state.updates[0]).toMatchObject({ table: 'space_segments', patch: { field_keys: ['joined', 'shirt'] } })
    expect(state.updates[0].eqs).toEqual([
      ['id', 'seg-a'],
      ['space_id', 's1'],
    ])
  })
})
