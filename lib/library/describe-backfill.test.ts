import { describe, it, expect, vi, beforeEach } from 'vitest'

// HYG-021 / ADR-1254 — the DATABASE half of the descriptor backfill.
//
// The action decides who may describe an asset; this decides what the write can possibly do. Both
// columns carry an `.is(<column>, null)` guard, which is the property that makes a client-supplied
// value safe: it can add a placeholder where there is none and can never repaint or clear one that
// is already there, even if two describes race. And the columns are written SEPARATELY, because they
// go null independently: one guarded update carrying both would drop both whenever either was set.

type Update = {
  table: string
  patch: Record<string, unknown>
  eqs: [string, unknown][]
  isNull: string[]
  filters: [string, string, unknown][]
}
const updates: Update[] = []
let updateError: { message: string } | null = null
/** Rows the update reports back. Empty is what a BLOCKED guard returns: no error, nothing changed. */
let updatedRows: { id: string }[] = [{ id: 'asset-1' }]

function builder(table: string) {
  const call: Update = { table, patch: {}, eqs: [], isNull: [], filters: [] }
  const api: Record<string, unknown> = {
    update: (patch: Record<string, unknown>) => {
      call.patch = patch
      updates.push(call)
      return api
    },
    eq: (col: string, val: unknown) => {
      call.eqs.push([col, val])
      return api
    },
    is: (col: string) => {
      call.isNull.push(col)
      return api
    },
    filter: (col: string, op: string, val: unknown) => {
      call.filters.push([col, op, val])
      return api
    },
    select: () => api,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: updateError ? null : updatedRows, error: updateError })),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

const { backfillLibraryAssetDescriptor, fillLibraryAssetDescription } = await import('./store')

beforeEach(() => {
  updates.length = 0
  updateError = null
  updatedRows = [{ id: 'asset-1' }]
})

describe('backfillLibraryAssetDescriptor', () => {
  it('writes each column separately, bound to the id and guarded on null', async () => {
    const written = await backfillLibraryAssetDescriptor('asset-1', { blurhash: 'LEHV6n', colors: ['#aabbcc'] })
    expect(written).toEqual(['blurhash', 'colors'])
    expect(updates).toHaveLength(2)
    expect(updates[0]).toMatchObject({
      table: 'library_assets',
      patch: { blurhash: 'LEHV6n' },
      eqs: [['id', 'asset-1']],
      isNull: ['blurhash'],
    })
    expect(updates[1]).toMatchObject({ patch: { colors: ['#aabbcc'] }, isNull: ['colors'] })
  })

  it('writes nothing at all when there is nothing to add', async () => {
    expect(await backfillLibraryAssetDescriptor('asset-1', { blurhash: null, colors: [] })).toEqual([])
    expect(updates).toHaveLength(0)
  })

  it('writes only the half it was given', async () => {
    await backfillLibraryAssetDescriptor('asset-1', { blurhash: null, colors: ['#112233'] })
    expect(updates).toHaveLength(1)
    expect(updates[0].patch).toEqual({ colors: ['#112233'] })
  })

  it('reports nothing written when the write fails', async () => {
    updateError = { message: 'nope' }
    expect(await backfillLibraryAssetDescriptor('asset-1', { blurhash: 'LEHV6n' })).toEqual([])
  })

  it('reports nothing written when the null guard blocked the update', async () => {
    // PostgREST answers a guarded update that matched no row with zero rows and NO error. Reporting
    // that as written would make the return value a lie, which is why each update asks for its row.
    updatedRows = []
    expect(await backfillLibraryAssetDescriptor('asset-1', { blurhash: 'LEHV6n', colors: ['#aabbcc'] })).toEqual([])
    expect(updates).toHaveLength(2)
  })
})

// LIVE-587 / ADR-1589 — the same contract for what Vera proposes. Three columns, three guarded
// updates: tags only while EMPTY, alt and category only while NULL. A person who typed one of them
// keeps it and Vera fills the rest; a written tag set carries the vera tag.
describe('fillLibraryAssetDescription', () => {
  it('writes tags, alt and category separately, each guarded on empty', async () => {
    const written = await fillLibraryAssetDescription('asset-1', {
      tags: ['Dog', 'beach', 'dog'],
      alt: ' A dog on a beach. ',
      category: 'Animals',
    })
    expect(written).toEqual(['tags', 'alt', 'category'])
    expect(updates).toHaveLength(3)
    expect(updates[0]).toMatchObject({
      patch: { tags: ['dog', 'beach', 'vera'] },
      eqs: [['id', 'asset-1']],
      filters: [['tags', 'eq', '{}']],
      isNull: [],
    })
    expect(updates[1]).toMatchObject({ patch: { alt: 'A dog on a beach.' }, isNull: ['alt'] })
    expect(updates[2]).toMatchObject({ patch: { category: 'Animals' }, isNull: ['category'] })
  })

  it('does not add a second vera tag, and writes nothing for an empty proposal', async () => {
    await fillLibraryAssetDescription('asset-1', { tags: ['vera', 'sky'] })
    expect(updates[0].patch).toEqual({ tags: ['vera', 'sky'] })
    updates.length = 0
    expect(await fillLibraryAssetDescription('asset-1', { tags: [], alt: '  ', category: null })).toEqual([])
    expect(updates).toHaveLength(0)
  })

  it('reports nothing written when every guard blocked the update (a person already named it)', async () => {
    updatedRows = []
    expect(await fillLibraryAssetDescription('asset-1', { tags: ['sky'], alt: 'Sky.', category: 'Nature' })).toEqual([])
    expect(updates).toHaveLength(3)
  })
})
