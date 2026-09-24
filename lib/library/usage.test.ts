import { describe, it, expect, vi, beforeEach } from 'vitest'

// The usage index read (PROG-D4, ADR-1502). The properties that matter, in order of
// how expensive they were to learn: a FAILED read is reported as a failure and never as
// "not used" (ADR-979 is the table that died of that), live + draft copies of one page
// count as ONE page, and every place carries the link a human needs to go and look.

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null }
let throwOnRpc = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (throwOnRpc) throw new Error('no credentials')
      rpcCalls.push({ fn, args })
      return Promise.resolve(result)
    },
  }),
}))

// The marketing-site path table lives beside the admin client; keep the test free of it.
vi.mock('@/lib/page-editor/data', () => ({
  pathForSlug: (slug: string) => (slug === 'home' ? '/' : `/${slug}`),
}))

import { findLibraryAssetUsage, placeForUsageRow, summarizeUsageRows, type AssetUsageRow } from './usage'

const ID = 'aaaaaaaa-0000-4000-a000-00000000000a'

beforeEach(() => {
  rpcCalls.length = 0
  result = { data: [], error: null }
  throwOnRpc = false
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
