import { describe, it, expect, vi, beforeEach } from 'vitest'

// The usage index read (PROG-D4, ADR-1502). The properties that matter, in order of
// how expensive they were to learn: a FAILED read is reported as a failure and never as
// "not used" (ADR-979 is the table that died of that), live + draft copies of one page
// count as ONE page, and every place carries the link a human needs to go and look.

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null }
let throwOnRpc = false

// A tiny table store for the swap's reads and writes: `from(table).select().eq()...maybeSingle()`
// reads a row by its filters, `from(table).update(patch).eq(col, val)` patches the matching rows
// and records the write. `failWrite` makes the next update of that table fail, for the mid-way case.
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const writes: { table: string; patch: Row; filters: [string, unknown][] }[] = []
let failWrite: string | null = null

function fakeFrom(table: string) {
  const filters: [string, unknown][] = []
  const matches = (row: Row) => filters.every(([c, v]) => row[c] === v)
  const selectChain = {
    eq(col: string, val: unknown) {
      filters.push([col, val])
      return selectChain
    },
    maybeSingle() {
      const row = (tables[table] ?? []).find(matches) ?? null
      return Promise.resolve({ data: row ? { ...row } : null, error: null })
    },
  }
  return {
    select: () => selectChain,
    update(patch: Row) {
      return {
        eq(col: string, val: unknown) {
          filters.push([col, val])
          if (failWrite === table) {
            failWrite = null
            return Promise.resolve({ error: { message: 'connection reset' } })
          }
          for (const row of tables[table] ?? []) if (matches(row)) Object.assign(row, patch)
          writes.push({ table, patch, filters: [...filters] })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (throwOnRpc) throw new Error('no credentials')
      rpcCalls.push({ fn, args })
      return Promise.resolve(result)
    },
    from: fakeFrom,
  }),
}))

// The marketing-site path table lives beside the admin client; keep the test free of it.
vi.mock('@/lib/page-editor/data', () => ({
  pathForSlug: (slug: string) => (slug === 'home' ? '/' : `/${slug}`),
}))

import {
  findLibraryAssetUsage,
  placeForUsageRow,
  summarizeUsageRows,
  swapLibraryAssetRefs,
  swapPlanFiles,
  swapSpacePreferences,
  type AssetUsageRow,
} from './usage'

const ID = 'aaaaaaaa-0000-4000-a000-00000000000a'

beforeEach(() => {
  rpcCalls.length = 0
  result = { data: [], error: null }
  throwOnRpc = false
  for (const k of Object.keys(tables)) delete tables[k]
  writes.length = 0
  failWrite = null
})

describe('findLibraryAssetUsage', () => {
  it('asks library_asset_usage for the id and reports zero pages when nothing references it', async () => {
    const out = await findLibraryAssetUsage(ID)
    expect(rpcCalls).toEqual([{ fn: 'library_asset_usage', args: { p_asset_id: ID } }])
    expect(out).toEqual({ ok: true, pages: 0, refs: 0, places: [] })
  })

  it('never reports zero on a failed read: an rpc error is ok:false', async () => {
    result = { data: null, error: { message: 'function library_asset_usage(uuid) does not exist' } }
    const out = await findLibraryAssetUsage(ID)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/does not exist/)
  })

  it('never reports zero on a thrown read either (build without credentials)', async () => {
    throwOnRpc = true
    const out = await findLibraryAssetUsage(ID)
    expect(out).toEqual({ ok: false, error: 'no credentials' })
  })

  it('does not query for a malformed id (author-controlled input never reaches the scan)', async () => {
    const out = await findLibraryAssetUsage("x' or 1=1")
    expect(rpcCalls).toEqual([])
    expect(out).toEqual({ ok: true, pages: 0, refs: 0, places: [] })
  })

  it('counts a page once across its live and draft copies, and sums every ref', async () => {
    result = {
      data: [
        { store: 'pages', space_id: 'r', space_slug: 'frequency', space_type: 'root', doc_key: 'about', live: true, hits: 2 },
        { store: 'pages', space_id: 'r', space_slug: 'frequency', space_type: 'root', doc_key: 'about', live: false, hits: 3 },
        { store: 'space_page', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'home', live: true, hits: 1 },
      ] satisfies AssetUsageRow[],
      error: null,
    }
    const out = await findLibraryAssetUsage(ID)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.pages).toBe(2)
    expect(out.refs).toBe(6)
    expect(out.places.map((p) => p.href)).toEqual(['/about', '/about', '/spaces/royal-temple'])
  })
})

describe('placeForUsageRow', () => {
  const base = { space_id: 's1', space_slug: 'royal-temple', space_type: 'business', live: true, hits: 1 }

  it('links a root-space marketing page to its public path and names a non-root page without a link', () => {
    const root = placeForUsageRow({ ...base, store: 'pages', space_type: 'root', space_slug: 'frequency', doc_key: 'home' })
    expect(root).toMatchObject({ label: 'Page: home', href: '/' })
    const other = placeForUsageRow({ ...base, store: 'pages', doc_key: 'home' })
    expect(other).toMatchObject({ label: 'Page: home (royal-temple)', href: null })
  })

  it('links a Space page to the profile (home) or its sub-page', () => {
    expect(placeForUsageRow({ ...base, store: 'space_page', doc_key: 'home' })).toMatchObject({
      label: 'Space: royal-temple',
      href: '/spaces/royal-temple',
    })
    expect(placeForUsageRow({ ...base, store: 'space_page', doc_key: 'menu' })).toMatchObject({
      label: 'Space: royal-temple / menu',
      href: '/spaces/royal-temple/menu',
    })
  })

  it('links the Space entity-block grid to the profile and marks a draft as a draft', () => {
    const p = placeForUsageRow({ ...base, store: 'space_layout', doc_key: 'profileLayoutDraft', live: false })
    expect(p).toMatchObject({ label: 'Space profile blocks: royal-temple', href: '/spaces/royal-temple', live: false })
    expect(p.key).toBe('space_layout:s1:profileLayoutDraft:draft')
  })

  it('names a Plan by its Space and links to the calendar, never printing the Plan id', () => {
    // PROG-CAL14: a Plan holds Loom images, so the Loom has to be able to say so before an operator
    // retires one. `doc_key` is the Plan's uuid, which is a key and not copy; an archived Plan is
    // still a usage site (archiving is reversible and the Plan keeps its images) and reads as not
    // live so the drawer can say which it is.
    const open = placeForUsageRow({ ...base, store: 'space_plan', doc_key: 'plan-uuid-1' })
    expect(open).toMatchObject({
      label: 'Plan in royal-temple',
      href: '/spaces/royal-temple/settings/calendar',
      live: true,
    })
    expect(open.label).not.toContain('plan-uuid-1')
    expect(open.key).toBe('space_plan:s1:plan-uuid-1:live')
    const archived = placeForUsageRow({ ...base, store: 'space_plan', doc_key: 'plan-uuid-2', live: false })
    expect(archived.live).toBe(false)
  })

  it('keeps an unknown store visible rather than dropping it', () => {
    expect(placeForUsageRow({ ...base, store: 'later_store', doc_key: 'x' })).toMatchObject({ label: 'later_store: x', href: null })
  })
})

describe('summarizeUsageRows', () => {
  it('treats a non-numeric hit count as zero rather than NaN-ing the total', () => {
    const out = summarizeUsageRows([
      { store: 'pages', space_id: null, space_slug: null, space_type: null, doc_key: 'a', live: true, hits: Number.NaN },
    ])
    expect(out).toMatchObject({ pages: 1, refs: 0 })
  })
})

// ── Global swap (LIVE-451, ADR-1559) ────────────────────────────────────────────────────────────
//
// The two properties the row named, in its words: a swap "rewrites every ref" from A to B across
// the documents the index lists, and it "leaves a third asset untouched". Plus the refusals that
// keep it from writing blind: a failed usage read, a missing or archived target, a store the swap
// has not learned, and the same asset twice.

const A = ID
const B = 'bbbbbbbb-0000-4000-b000-00000000000b'
const C = 'cccccccc-0000-4000-c000-00000000000c'
const refA = () => ({ assetId: A, url: 'https://cdn/a.png' })
const refB = () => ({ assetId: B, url: 'https://cdn/b-current.png' })
const refC = () => ({ assetId: C, url: 'https://cdn/c.png' })

/** A corpus with A, B and C spread over every store the index lists. */
function seedCorpus() {
  tables.library_assets = [
    { id: B, url: 'https://cdn/b-current.png', status: 'approved' },
    { id: 'dddddddd-0000-4000-d000-00000000000d', url: 'https://cdn/d.png', status: 'archived' },
    { id: 'eeeeeeee-0000-4000-e000-00000000000e', url: null, status: 'approved' },
  ]
  tables.pages = [
    {
      id: 'page-1',
      space_id: 'root-space',
      slug: 'about',
      data: { content: [{ type: 'Hero', props: { image: refA(), logo: refC() } }, { type: 'Img', props: { src: refA() } }] },
      published_data: { content: [{ type: 'Hero', props: { image: refA(), logo: refC() } }] },
    },
    { id: 'page-2', space_id: 'root-space', slug: 'untouched', data: { content: [{ type: 'Img', props: { src: refC() } }] }, published_data: null },
  ]
  tables.spaces = [
    {
      id: 's1',
      preferences: {
        theme: 'dusk',
        pages: [{ slug: 'menu' }],
        pageDocs: { home: { content: [{ type: 'Cover', props: { image: refA() } }] }, menu: { content: [{ type: 'Img', props: { src: refC() } }] } },
        // pageDocs.home exists, so this legacy doc is dead to the index and must stay as it is.
        puck: { content: [{ type: 'Cover', props: { image: refA() } }] },
        profileLayout: { rows: [{ cells: [['gallery']] }], content: { gallery: { images: [refA(), { assetId: A, url: 'https://cdn/a.png', alt: 'the room' }, refC()] } } },
        profileLayoutDraft: { rows: [], content: { hero: { image: refA() } } },
      },
    },
  ]
  tables.space_plans = [
    { id: 'plan-1', space_id: 's1', files: [refA(), refC()] },
    { id: 'plan-2', space_id: 's1', files: [refB(), refA()] },
  ]
  result = {
    data: [
      { store: 'pages', space_id: 'root-space', space_slug: 'frequency', space_type: 'root', doc_key: 'about', live: true, hits: 1 },
      { store: 'pages', space_id: 'root-space', space_slug: 'frequency', space_type: 'root', doc_key: 'about', live: false, hits: 2 },
      { store: 'space_page', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'home', live: true, hits: 1 },
      { store: 'space_layout', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'profileLayout', live: true, hits: 2 },
      { store: 'space_layout', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'profileLayoutDraft', live: false, hits: 1 },
      { store: 'space_plan', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'plan-1', live: true, hits: 1 },
      { store: 'space_plan', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'plan-2', live: false, hits: 1 },
    ] satisfies AssetUsageRow[],
    error: null,
  }
}

/** Every ref object anywhere in `value`, for counting what points where after the swap. */
function refsIn(value: unknown, into: { assetId: string; url: string }[] = []) {
  if (!value || typeof value !== 'object') return into
  if (Array.isArray(value)) {
    for (const v of value) refsIn(v, into)
    return into
  }
  const v = value as Record<string, unknown>
  if (typeof v.assetId === 'string' && typeof v.url === 'string') into.push({ assetId: v.assetId, url: v.url })
  else for (const x of Object.values(v)) refsIn(x, into)
  return into
}

describe('swapLibraryAssetRefs', () => {
  it('rewrites every ref from A to B across every store the index lists, one write per stored row, with B\'s current url', async () => {
    seedCorpus()
    const out = await swapLibraryAssetRefs(A, B)
    expect(out).toMatchObject({ ok: true, documents: 4, refs: 9 })
    // One write per stored row: the page (both copies in one update), the Space, each Plan.
    expect(writes.map((w) => `${w.table}:${String(w.filters[0][1])}`)).toEqual([
      'pages:page-1',
      'spaces:s1',
      'space_plans:plan-1',
      'space_plans:plan-2',
    ])
    const page = tables.pages[0]
    const space = tables.spaces[0].preferences as Record<string, unknown>
    const everything = [page.data, page.published_data, space.pageDocs, space.profileLayout, space.profileLayoutDraft, ...tables.space_plans.map((p) => p.files)]
    const after = refsIn(everything)
    expect(after.filter((r) => r.assetId === A)).toEqual([])
    const bs = after.filter((r) => r.assetId === B)
    expect(bs.length).toBe(9)
    expect(bs.every((r) => r.url === 'https://cdn/b-current.png')).toBe(true)
    // The authored alt beside a swapped ref survives the swap.
    const gallery = (space.profileLayout as { content: { gallery: { images: unknown[] } } }).content.gallery.images
    expect(gallery[1]).toEqual({ assetId: B, url: 'https://cdn/b-current.png', alt: 'the room' })
  })

  it('leaves a third asset untouched, and every other value byte-for-byte, and does not rewrite documents the index does not list', async () => {
    seedCorpus()
    const before = {
      cRefs: refsIn(JSON.parse(JSON.stringify([tables.pages, tables.spaces, tables.space_plans]))).filter((r) => r.assetId === C),
      untouchedPage: JSON.stringify(tables.pages[1]),
      puck: JSON.stringify((tables.spaces[0].preferences as Record<string, unknown>).puck),
      theme: (tables.spaces[0].preferences as Record<string, unknown>).theme,
      pagesNav: JSON.stringify((tables.spaces[0].preferences as Record<string, unknown>).pages),
      menuDoc: JSON.stringify(((tables.spaces[0].preferences as Record<string, unknown>).pageDocs as Record<string, unknown>).menu),
      rows: JSON.stringify(((tables.spaces[0].preferences as Record<string, unknown>).profileLayout as Record<string, unknown>).rows),
    }
    const out = await swapLibraryAssetRefs(A, B)
    expect(out.ok).toBe(true)
    const prefs = tables.spaces[0].preferences as Record<string, unknown>
    const cAfter = refsIn([tables.pages, tables.spaces, tables.space_plans]).filter((r) => r.assetId === C)
    expect(cAfter).toEqual(before.cRefs)
    expect(cAfter.length).toBe(6)
    expect(JSON.stringify(tables.pages[1])).toBe(before.untouchedPage)
    expect(JSON.stringify(prefs.puck)).toBe(before.puck) // dead legacy doc, not listed by the index
    expect(prefs.theme).toBe(before.theme)
    expect(JSON.stringify(prefs.pages)).toBe(before.pagesNav)
    expect(JSON.stringify((prefs.pageDocs as Record<string, unknown>).menu)).toBe(before.menuDoc)
    expect(JSON.stringify((prefs.profileLayout as Record<string, unknown>).rows)).toBe(before.rows)
    // A page's unchanged copy is not written: the patch names only the columns that changed.
    expect(writes[0].patch).toHaveProperty('data')
    expect(writes[0].patch).toHaveProperty('published_data')
    expect(Object.keys(writes[0].patch).sort()).toEqual(['data', 'published_data'])
  })

  it('keeps one row per asset in a Plan that already held B beside A', async () => {
    seedCorpus()
    await swapLibraryAssetRefs(A, B)
    expect(tables.space_plans[1].files).toEqual([{ assetId: B, url: 'https://cdn/b-current.png' }])
    expect(tables.space_plans[0].files).toEqual([{ assetId: B, url: 'https://cdn/b-current.png' }, refC()])
  })

  it('writes nothing when the usage read fails: never swap blind', async () => {
    seedCorpus()
    result = { data: null, error: { message: 'function library_asset_usage(uuid) does not exist' } }
    const out = await swapLibraryAssetRefs(A, B)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/Could not check where this asset is used/)
    expect(writes).toEqual([])
  })

  it('writes nothing and says so when nothing references A', async () => {
    seedCorpus()
    result = { data: [], error: null }
    expect(await swapLibraryAssetRefs(A, B)).toEqual({ ok: true, documents: 0, refs: 0, places: [] })
    expect(writes).toEqual([])
  })

  it('refuses a missing, archived or file-less target, the same id twice, and a malformed id, before reading usage', async () => {
    seedCorpus()
    expect(await swapLibraryAssetRefs(A, 'ffffffff-0000-4000-f000-00000000000f')).toEqual({ ok: false, error: 'That asset no longer exists.' })
    expect(await swapLibraryAssetRefs(A, 'dddddddd-0000-4000-d000-00000000000d')).toMatchObject({ ok: false, error: expect.stringMatching(/archived/) })
    expect(await swapLibraryAssetRefs(A, 'eeeeeeee-0000-4000-e000-00000000000e')).toMatchObject({ ok: false, error: expect.stringMatching(/no file/) })
    expect(await swapLibraryAssetRefs(A, A)).toMatchObject({ ok: false, error: expect.stringMatching(/different asset/) })
    expect(await swapLibraryAssetRefs("x' or 1=1", B)).toMatchObject({ ok: false, error: expect.stringMatching(/not valid/) })
    expect(rpcCalls).toEqual([])
    expect(writes).toEqual([])
  })

  it('refuses before the first write when the index lists a store it cannot rewrite', async () => {
    seedCorpus()
    result = {
      data: [
        { store: 'pages', space_id: 'root-space', space_slug: 'frequency', space_type: 'root', doc_key: 'about', live: true, hits: 1 },
        { store: 'later_store', space_id: 's1', space_slug: 'royal-temple', space_type: 'business', doc_key: 'x', live: true, hits: 1 },
      ],
      error: null,
    }
    const out = await swapLibraryAssetRefs(A, B)
    expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/later_store/) })
    expect(writes).toEqual([])
    expect(refsIn(tables.pages[0].data).filter((r) => r.assetId === A).length).toBe(2)
  })

  it('reports a write that failed mid-way with what was rewritten before it, and a retry finishes the rest', async () => {
    seedCorpus()
    failWrite = 'spaces'
    const first = await swapLibraryAssetRefs(A, B)
    expect(first).toMatchObject({ ok: false, error: expect.stringMatching(/Space: connection reset\. 1 of the places were rewritten/) })
    expect(writes.map((w) => w.table)).toEqual(['pages'])
    // The index now lists only what is left (the page no longer references A).
    result = { data: (result.data as AssetUsageRow[]).filter((r) => r.store !== 'pages'), error: null }
    const second = await swapLibraryAssetRefs(A, B)
    expect(second).toMatchObject({ ok: true, documents: 3, refs: 6 })
    // Everything the index lists is on B now; the dead `puck` doc is the one A left, on purpose.
    const prefs = tables.spaces[0].preferences as Record<string, unknown>
    const listed = [tables.pages, prefs.pageDocs, prefs.profileLayout, prefs.profileLayoutDraft, tables.space_plans]
    expect(refsIn(listed).filter((r) => r.assetId === A)).toEqual([])
    expect(refsIn(prefs.puck).filter((r) => r.assetId === A).length).toBe(1)
  })
})

describe('swapSpacePreferences', () => {
  it('rewrites the legacy puck doc only when pageDocs.home is absent (the index\'s fallback rule)', () => {
    const to = { assetId: B, url: 'https://cdn/b-current.png' }
    const legacyOnly = { puck: { content: [{ type: 'Cover', props: { image: refA() } }] }, pageDocs: { menu: {} } }
    const out = swapSpacePreferences(legacyOnly, A, to)
    expect(out.swapped).toBe(1)
    expect(refsIn(out.preferences)[0]).toEqual(to)
    const withHome = { puck: { content: [{ type: 'Cover', props: { image: refA() } }] }, pageDocs: { home: {} } }
    const kept = swapSpacePreferences(withHome, A, to)
    expect(kept.swapped).toBe(0)
    expect(kept.preferences).toBe(withHome)
  })

  it('leaves a ref under any other preferences key alone: the swap covers what the index scans, no more', () => {
    const to = { assetId: B, url: 'https://cdn/b-current.png' }
    const prefs = { brand: { logo: refA() }, profileLayout: { content: { hero: { image: refA() } } } }
    const out = swapSpacePreferences(prefs, A, to)
    expect(out.swapped).toBe(1)
    expect((out.preferences as { brand: unknown }).brand).toBe(prefs.brand)
  })
})

describe('swapPlanFiles', () => {
  it('returns the same array when nothing references A and never dedupes an untouched list', () => {
    const files = [refB(), refB(), refC()]
    const out = swapPlanFiles(files, A, { assetId: B, url: 'https://cdn/b-current.png' })
    expect(out.swapped).toBe(0)
    expect(out.files).toBe(files)
  })
})
