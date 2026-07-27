import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// updateListing + the saves (favorites) helpers, against a recording admin-client stub
// (mirrors lib/feed/post-origin.test.ts). What matters here is the SHAPE of the writes:
// updateListing must be owner-scoped IN THE WHERE (id + owner_profile_id), the patch
// must stay within the allowed columns/caps, and the saves helpers must batch.

interface RecordedCall {
  table: string
  op: 'select' | 'update' | 'upsert' | 'delete' | null
  row: Record<string, unknown> | null
  filters: [string, unknown][]
  inFilter: [string, unknown[]] | null
  limit: number | null
}

const calls: RecordedCall[] = []
// Data payloads handed back per terminal read, in call order.
const results: unknown[] = []

function makeBuilder(table: string) {
  const call: RecordedCall = { table, op: null, row: null, filters: [], inFilter: null, limit: null }
  calls.push(call)
  const resolve = () => Promise.resolve({ data: results.shift() ?? null, error: null })
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    select: () => b,
    update: (row: Record<string, unknown>) => ((call.op = 'update'), (call.row = row), b),
    upsert: (row: Record<string, unknown>) => ((call.op = 'upsert'), (call.row = row), b),
    delete: () => ((call.op = 'delete'), b),
    eq: (col: string, v: unknown) => (call.filters.push([col, v]), b),
    in: (col: string, vals: unknown[]) => ((call.inFilter = [col, vals]), b),
    order: () => b,
    limit: (n: number) => ((call.limit = n), b),
    maybeSingle: resolve,
    // The builder is thenable so bare awaits (upsert/delete/select chains) resolve too.
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => resolve().then(onOk, onErr),
  })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: makeBuilder }) }))
vi.mock('@/lib/listing-seeder/seed-owner', () => ({ resolveSeedOwnerProfileId: async () => null }))
vi.mock('@/lib/finance/record', () => ({ ENTITY_ID: { foundation: 'ent-foundation' } }))

import {
  listSavedListingIds,
  listSavedListings,
  saveListing,
  unsaveListing,
  updateListing,
} from './index'

beforeEach(() => {
  calls.length = 0
  results.length = 0
})

describe('updateListing', () => {
  it('scopes the UPDATE to the owner in the WHERE (id AND owner_profile_id)', async () => {
    results.push({ id: 'l-1' })
    const ok = await updateListing('l-1', 'owner-a', { title: 'Bright room near the park' })
    expect(ok).toBe(true)
    const [call] = calls
    expect(call.table).toBe('listings')
    expect(call.op).toBe('update')
    expect(call.filters).toEqual([
      ['id', 'l-1'],
      ['owner_profile_id', 'owner-a'],
    ])
  })

  it('returns false for the wrong owner — the WHERE matches nothing, so the patch lands nowhere', async () => {
    results.push(null) // no row matched (id + wrong owner_profile_id)
    const ok = await updateListing('l-1', 'someone-else', { title: 'Hijacked title' })
    expect(ok).toBe(false)
    expect(calls[0].filters).toContainEqual(['owner_profile_id', 'someone-else'])
  })

  it('caps title at 120 chars and images at 6, like createListing', async () => {
    results.push({ id: 'l-1' })
    await updateListing('l-1', 'owner-a', {
      title: 'x'.repeat(200),
      images: Array.from({ length: 9 }, (_, i) => `img-${i}`),
    })
    const row = calls[0].row!
    expect((row.title as string).length).toBe(120)
    expect(row.images as string[]).toHaveLength(6)
  })

  it('writes ONLY the patched columns (a partial patch never nulls the rest)', async () => {
    results.push({ id: 'l-1' })
    await updateListing('l-1', 'owner-a', { city: 'San Diego', priceNote: '$1450/mo' })
    expect(Object.keys(calls[0].row!).sort()).toEqual(['city', 'price_note'])
  })

  it('refuses an empty patch and a blank title without touching the DB', async () => {
    expect(await updateListing('l-1', 'owner-a', {})).toBe(false)
    expect(await updateListing('l-1', 'owner-a', { title: '   ' })).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('saves (listing_saves)', () => {
  it('saveListing upserts onto the (profile_id, listing_id) PK — idempotent by construction', async () => {
    await saveListing('me', 'l-1')
    const [call] = calls
    expect(call.table).toBe('listing_saves')
    expect(call.op).toBe('upsert')
    expect(call.row).toEqual({ profile_id: 'me', listing_id: 'l-1' })
  })

  it('unsaveListing deletes exactly the pair row', async () => {
    await unsaveListing('me', 'l-1')
    const [call] = calls
    expect(call.table).toBe('listing_saves')
    expect(call.op).toBe('delete')
    expect(call.filters).toEqual([
      ['profile_id', 'me'],
      ['listing_id', 'l-1'],
    ])
  })

  it('round-trips: what saveListing writes is what listSavedListingIds reads back', async () => {
    await saveListing('me', 'l-1')
    results.push([{ listing_id: 'l-1' }])
    const saved = await listSavedListingIds('me', ['l-1', 'l-2'])
    expect(saved.has('l-1')).toBe(true)
    expect(saved.has('l-2')).toBe(false)
  })

  it('listSavedListingIds is ONE batched membership read (.in over the grid ids)', async () => {
    results.push([{ listing_id: 'a' }, { listing_id: 'c' }])
    const saved = await listSavedListingIds('me', ['a', 'b', 'c'])
    expect(saved).toEqual(new Set(['a', 'c']))
    expect(calls).toHaveLength(1) // never a per-card query
    expect(calls[0].table).toBe('listing_saves')
    expect(calls[0].filters).toEqual([['profile_id', 'me']])
    expect(calls[0].inFilter).toEqual(['listing_id', ['a', 'b', 'c']])
  })

  it('listSavedListingIds short-circuits an empty grid without a query', async () => {
    expect(await listSavedListingIds('me', [])).toEqual(new Set())
    expect(calls).toHaveLength(0)
  })

  it('listSavedListings joins to ACTIVE listings of the vertical only', async () => {
    results.push([
      {
        created_at: '2026-07-01T00:00:00Z',
        listing: {
          id: 'l-1',
          vertical: 'housing',
          owner_profile_id: 'host-1',
          entity_id: 'ent-foundation',
          title: 'Sunny room',
          status: 'active',
          images: [],
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
      },
    ])
    const listings = await listSavedListings('me', 'housing')
    expect(listings).toHaveLength(1)
    expect(listings[0].id).toBe('l-1')
    expect(listings[0].title).toBe('Sunny room')
    const [call] = calls
    expect(call.table).toBe('listing_saves')
    expect(call.filters).toEqual([
      ['profile_id', 'me'],
      ['listing.vertical', 'housing'],
      ['listing.status', 'active'],
    ])
  })
})

// ── Wiring (source shape): the surfaces actually mount what this layer provides ──────

const DETAIL_PAGE = 'app/(main)/marketplace/housing/[id]/page.tsx'
const INDEX_PAGE = 'app/(main)/marketplace/housing/page.tsx'
const EDIT_DIR = 'app/(main)/marketplace/housing/[id]/edit'

describe('housing surfaces wiring', () => {
  it('the edit route exists (page + actions)', () => {
    expect(existsSync(`${EDIT_DIR}/page.tsx`), 'the housing edit page is missing').toBe(true)
    expect(existsSync(`${EDIT_DIR}/actions.ts`), 'the housing edit actions file is missing').toBe(true)
  })

  it('the edit page reuses HousingForm with a prefill + the bound update action', () => {
    const src = readFileSync(`${EDIT_DIR}/page.tsx`, 'utf8')
    expect(src).toContain('HousingForm')
    expect(src).toContain('initial=')
    expect(src).toContain('updateHousingListingAction.bind')
  })

  it('the detail page links owners to the edit route and mounts the save heart', () => {
    const src = readFileSync(DETAIL_PAGE, 'utf8')
    expect(src).toContain('/edit')
    expect(src).toContain('SaveListingButton')
  })

  it('the index page carries the ?saved=1 filter with its honest empty state', () => {
    const src = readFileSync(INDEX_PAGE, 'utf8')
    expect(src).toContain("sp.saved === '1'")
    expect(src).toContain('listSavedListings')
    expect(src).toContain('SaveListingButton')
    expect(src).toContain('Nothing saved yet.')
    expect(src).toContain('Tap the heart on a home to keep it here.')
  })
})
