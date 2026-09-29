import 'server-only'

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { pathForSlug } from '@/lib/page-editor/data'
import { swapAssetRefs, type AssetSwapTarget } from '@/lib/library/asset-ref'

// ─────────────────────────────────────────────────────────────────────────────
// THE USAGE INDEX (PROG-D4, ADR-1502): "which pages use this asset?"
//
// The read half of the seam ADR-1130 opened. A block document stores an asset
// as { assetId, url } (lib/library/asset-ref.ts), and since PROG-CAL14 so does a
// Space Plan's Images group; this module asks the database
// which stored documents carry a ref to a given id, through the SECURITY INVOKER
// function `library_asset_usage(uuid)` (supabase/migrations/20270345007500). The
// scan is live: there is no table to refresh, so a document saved a second ago is
// already counted and a deleted document is already gone.
//
// 🔴 A FAILED READ IS NOT "NOT USED". The table this replaces died of exactly that
// (ADR-979: the read discarded its error and returned [], so every asset looked
// unused). This module returns a discriminated result, and every consumer renders
// the failure as "could not check", never as zero. The safe-delete guard in
// app/(main)/admin/library/actions.ts refuses to delete on a failed read for the
// same reason: deleting an asset you could not prove unused is the destructive
// half of that bug.
//
// No pixels, no sharp, no next/og: one RPC and a pure mapping (DEPLOY-SAFETY).
//
// authz-delegated: `findLibraryAssetUsage` is a READ. `library_asset_usage` is a SECURITY INVOKER
// function that only SELECTs, revoked from every browser role and granted to service_role alone,
// so the admin client is the only way the read can reach it at all (scripts/function-grants.txt:
// internal). The gate lives at every call site: usage-actions.ts and actions.ts carry
// requireAdmin('janitor', { staff: 'marketing' }), the Loom Studio door (LIVE-289); the Space Loom
// Studio's delete and usage count in lib/loom/picker-actions.ts gate on canManageSpaceLoom and read
// only an asset bound to that Space (LIVE-568). The authz
// scan classes any `.rpc(` as a mutation because it cannot read the function body; this one is
// the read-only-RPC shape lib/analytics/marketing-intel.ts is allowlisted for.
// `swapLibraryAssetRefs` below DOES write, through the same admin client, and is caller-trusted
// on purpose: its one caller is `swapLibraryAssetEverywhere` in usage-actions.ts, which gates
// before it calls, and every write is bound by primary key to a row the usage index named.
// ─────────────────────────────────────────────────────────────────────────────

/** One row of `library_asset_usage`, as PostgREST returns it. */
export type AssetUsageRow = {
  store: 'pages' | 'space_page' | 'space_layout' | 'space_plan' | string
  space_id: string | null
  space_slug: string | null
  space_type: string | null
  doc_key: string
  live: boolean
  hits: number
}

/** One place an asset is used, ready to render: a label, a link when the page has a public
 *  address, whether it is the live copy or a draft, and how many refs the document carries. */
export type AssetUsagePlace = {
  /** Stable key for lists: store + space + doc + live/draft. */
  key: string
  label: string
  href: string | null
  live: boolean
  hits: number
}

export type AssetUsageResult =
  | {
      ok: true
      /** Distinct documents (a page's live and draft copies count once). */
      pages: number
      /** Every ref across every document. */
      refs: number
      places: AssetUsagePlace[]
    }
  | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Pure: one usage row → the place a human reads. Exported for the test; no I/O. */
export function placeForUsageRow(row: AssetUsageRow): AssetUsagePlace {
  const key = `${row.store}:${row.space_id ?? 'root'}:${row.doc_key}:${row.live ? 'live' : 'draft'}`
  const spaceSlug = row.space_slug ?? ''
  switch (row.store) {
    case 'pages': {
      // The marketing site: only the ROOT space's pages have a public route today. A page in
      // any other Space is named but not linked, because no route serves it yet.
      const isRoot = row.space_type === 'root'
      return {
        key,
        label: isRoot ? `Page: ${row.doc_key}` : `Page: ${row.doc_key} (${spaceSlug || 'space'})`,
        href: isRoot ? pathForSlug(row.doc_key) : null,
        live: row.live,
        hits: row.hits,
      }
    }
    case 'space_page': {
      const isHome = row.doc_key === 'home'
      return {
        key,
        label: isHome ? `Space: ${spaceSlug}` : `Space: ${spaceSlug} / ${row.doc_key}`,
        href: spaceSlug ? (isHome ? `/spaces/${spaceSlug}` : `/spaces/${spaceSlug}/${row.doc_key}`) : null,
        live: row.live,
        hits: row.hits,
      }
    }
    case 'space_layout':
      return {
        key,
        label: `Space profile blocks: ${spaceSlug}`,
        href: spaceSlug ? `/spaces/${spaceSlug}` : null,
        live: row.live,
        hits: row.hits,
      }
    // A Plan holds images the team attached (PROG-CAL14). `doc_key` is the Plan's id, which is a
    // key and not copy, so it is never printed: the label names the Space whose calendar the Plan
    // lives on, and `live` is false for a Plan that has been archived. The link goes to that
    // calendar, which is the only door a Plan opens from.
    case 'space_plan':
      return {
        key,
        label: `Plan in ${spaceSlug || 'a Space'}`,
        href: spaceSlug ? `/spaces/${spaceSlug}/settings/calendar` : null,
        live: row.live,
        hits: row.hits,
      }
    default:
      return { key, label: `${row.store}: ${row.doc_key}`, href: null, live: row.live, hits: row.hits }
  }
}

/** Pure: rows → the result the drawer renders. Live and draft copies of one document count as
 *  ONE page ("used on N pages" is about pages, not copies); refs sum across every copy. */
export function summarizeUsageRows(rows: AssetUsageRow[]): Extract<AssetUsageResult, { ok: true }> {
  const places = rows.map(placeForUsageRow)
  const docs = new Set(rows.map((r) => `${r.store}:${r.space_id ?? 'root'}:${r.doc_key}`))
  const refs = rows.reduce((n, r) => n + (Number.isFinite(r.hits) ? r.hits : 0), 0)
  return { ok: true, pages: docs.size, refs, places }
}

/**
 * Every stored block document that references `assetId`. Service-role read of a
 * SECURITY INVOKER function; the caller (a Studio-gated action) applies authz.
 * A malformed id is an empty result, not a query. A failed query is `ok: false`.
 */
export async function findLibraryAssetUsage(assetId: string): Promise<AssetUsageResult> {
  const read = await readUsageRows(assetId)
  return read.ok ? summarizeUsageRows(read.rows) : read
}

/** The raw index rows for a well-formed id (a malformed id is an empty read, not a query). Shared
 *  by the drawer's read and the swap below, so both see the same places. */
async function readUsageRows(assetId: string): Promise<{ ok: true; rows: AssetUsageRow[] } | { ok: false; error: string }> {
  const id = (assetId ?? '').trim()
  if (!UUID_RE.test(id)) return { ok: true, rows: [] }
  try {
    // ADR-246 untyped seam: `library_asset_usage` ships in migration 20270345007500 and is not
    // in the generated lib/database.types.ts until the next regeneration pass. The cast is
    // local to this call and listed in scripts/check-schema-contract.mjs ALLOWLIST.
    const rpc = createAdminClient() as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: AssetUsageRow[] | null; error: { message: string } | null }>
    }
    const { data, error } = await rpc.rpc('library_asset_usage', { p_asset_id: id })
    if (error) return { ok: false, error: error.message }
    return { ok: true, rows: Array.isArray(data) ? data : [] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Usage lookup failed.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL SWAP (the D4 remainder, LIVE-451, ADR-1560): "asset A becomes asset B everywhere."
//
// The write half of the seam, and the last organisation item LIBRARY.md lists beside the usage
// index. The index says WHERE (every stored document carrying a ref to A, one row per live/draft
// copy); the swap is a walk + write per stored row over exactly those places: `swapAssetRefs`
// (lib/library/asset-ref.ts, the applyAssetUrls shape) rewrites each `{ assetId: A, url }` to
// `{ assetId: B, url: <B's current url> }` and returns every other value as-is, so a ref to a
// third asset, a legacy URL string and an authored alt all come back byte-for-byte.
//
// ONE WRITE PER STORED ROW. A marketing page is one row holding its live and draft copies, so
// both columns go in one update; a Space's pageDocs, its legacy Home doc and both entity layouts
// live in one `preferences` blob, so a Space is one update however many of its documents the
// index listed; a Plan's images are one column. There is no cross-row transaction, and none is
// needed: the swap is IDEMPOTENT. A ref that has already moved to B is no longer a ref to A, so
// a retry after a failed write picks up exactly where the failure left it and rewrites nothing
// twice.
//
// COMPLETE OR NOT AT ALL, per store. The index can grow a store this module has not learned to
// write (PROG-CAL14 added `space_plan` that way). A store the swap cannot write is refused BEFORE
// the first write, naming the store, rather than rewritten "mostly": a swap that reports done
// while a Plan still shows asset A is the ADR-979 shape (a read that under-reports) turned into
// a write.
// ─────────────────────────────────────────────────────────────────────────────

export type AssetSwapResult =
  | {
      ok: true
      /** Stored rows written (a page, a Space, a Plan). Zero when nothing referenced the asset. */
      documents: number
      /** Refs rewritten across those rows. */
      refs: number
      /** The places the index listed, for the caller to revalidate and the drawer to name. */
      places: AssetUsagePlace[]
    }
  | { ok: false; error: string }

/** The keys of a Space's `preferences` blob that the usage index scans, and no others. */
const SPACE_DOC_KEYS = ['profileLayout', 'profileLayoutDraft'] as const

/**
 * Pure: rewrite the refs in exactly the Space documents the usage index scans, inside one
 * preferences blob. `pageDocs[*]`, the legacy `puck` Home doc ONLY when `pageDocs.home` is absent
 * (readPageDoc's fallback rule, which is the index's rule), `profileLayout` and `profileLayoutDraft`.
 * Every other preferences key is returned untouched, and an unchanged blob comes back as the same
 * object. Exported for the test.
 */
export function swapSpacePreferences(
  preferences: unknown,
  fromId: string,
  to: AssetSwapTarget,
): { preferences: unknown; swapped: number } {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return { preferences, swapped: 0 }
  }
  const prefs = preferences as Record<string, unknown>
  const next: Record<string, unknown> = { ...prefs }
  let swapped = 0
  let changed = false

  const pageDocs = prefs.pageDocs
  if (pageDocs && typeof pageDocs === 'object' && !Array.isArray(pageDocs)) {
    const docs = pageDocs as Record<string, unknown>
    const nextDocs: Record<string, unknown> = { ...docs }
    let docsChanged = false
    for (const [slug, doc] of Object.entries(docs)) {
      const out = swapAssetRefs(doc, fromId, to)
      if (out.swapped > 0) {
        nextDocs[slug] = out.value
        swapped += out.swapped
        docsChanged = true
      }
    }
    if (docsChanged) {
      next.pageDocs = nextDocs
      changed = true
    }
  }

  const hasHomeDoc =
    !!pageDocs && typeof pageDocs === 'object' && !Array.isArray(pageDocs) && 'home' in (pageDocs as object)
  if (!hasHomeDoc && 'puck' in prefs) {
    const out = swapAssetRefs(prefs.puck, fromId, to)
    if (out.swapped > 0) {
      next.puck = out.value
      swapped += out.swapped
      changed = true
    }
  }

  for (const key of SPACE_DOC_KEYS) {
    if (!(key in prefs)) continue
    const out = swapAssetRefs(prefs[key], fromId, to)
    if (out.swapped > 0) {
      next[key] = out.value
      swapped += out.swapped
      changed = true
    }
  }

  return { preferences: changed ? next : preferences, swapped }
}

/**
 * Pure: a Plan's `files` after the swap. The column holds one row per asset (parsePlanFiles's
 * contract, migration 20270345008400), so a Plan that already held B beside A keeps ONE B, the
 * first, and every other entry stays in place. Exported for the test.
 */
export function swapPlanFiles(files: unknown, fromId: string, to: AssetSwapTarget): { files: unknown; swapped: number } {
  const out = swapAssetRefs(files, fromId, to)
  if (out.swapped === 0 || !Array.isArray(out.value)) return { files: out.value, swapped: out.swapped }
  const seen = new Set<string>()
  const deduped = out.value.filter((item) => {
    const id =
      item && typeof item === 'object' && !Array.isArray(item) && typeof (item as { assetId?: unknown }).assetId === 'string'
        ? (item as { assetId: string }).assetId
        : null
    if (id === null) return true
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return { files: deduped, swapped: out.swapped }
}

const WRITABLE_STORES = new Set(['pages', 'space_page', 'space_layout', 'space_plan'])

/**
 * Rewrite every `{ assetId }` ref from asset `fromId` to asset `toId` across the stored documents
 * `library_asset_usage` lists, one write per stored row. Service-role writes bound by primary
 * key; the caller (a Studio-gated action) applies authz. Refuses, writing nothing, when: either id
 * is malformed or they are the same; the target asset is missing, archived or has no url; the
 * usage read fails (never swap blind, ADR-979); or the index lists a store this module cannot
 * write. A failed write mid-way reports how many rows were rewritten before it; a retry is safe.
 */
export async function swapLibraryAssetRefs(fromId: string, toId: string): Promise<AssetSwapResult> {
  const from = (fromId ?? '').trim()
  const toIdClean = (toId ?? '').trim()
  if (!UUID_RE.test(from) || !UUID_RE.test(toIdClean)) return { ok: false, error: 'That asset id is not valid.' }
  if (from === toIdClean) return { ok: false, error: 'Pick a different asset to swap to.' }

  try {
    const admin = createAdminClient()

    const { data: targetRow, error: targetErr } = await admin
      .from('library_assets')
      .select('id, url, status')
      .eq('id', toIdClean)
      .maybeSingle()
    if (targetErr) return { ok: false, error: targetErr.message }
    const target = targetRow as { id: string; url: string | null; status: string } | null
    if (!target) return { ok: false, error: 'That asset no longer exists.' }
    if (target.status === 'archived') return { ok: false, error: 'That asset is archived. Restore it first.' }
    if (!target.url) return { ok: false, error: 'That asset has no file to point pages at.' }
    const to: AssetSwapTarget = { assetId: target.id, url: target.url }

    const usage = await readUsageRows(from)
    if (!usage.ok) return { ok: false, error: `Could not check where this asset is used: ${usage.error}` }
    const places = usage.rows.map(placeForUsageRow)
    if (usage.rows.length === 0) return { ok: true, documents: 0, refs: 0, places }

    // The index rows, grouped into the stored rows they live in (a page's live and draft copies
    // are one row; a Space's documents are one preferences blob).
    const rows = usage.rows.map((r) => ({ store: r.store, spaceId: r.space_id, docKey: r.doc_key }))
    const unknown = rows.find((r) => !WRITABLE_STORES.has(r.store))
    if (unknown) {
      return {
        ok: false,
        error: `The usage index lists a place this swap cannot rewrite yet (${unknown.store}). Nothing was changed.`,
      }
    }

    const pageKeys = new Map<string, { spaceId: string | null; slug: string }>()
    const spaceIds = new Set<string>()
    const planIds = new Set<string>()
    for (const r of rows) {
      if (r.store === 'pages') pageKeys.set(`${r.spaceId ?? 'root'}:${r.docKey}`, { spaceId: r.spaceId, slug: r.docKey })
      else if (r.store === 'space_page' || r.store === 'space_layout') {
        if (r.spaceId) spaceIds.add(r.spaceId)
      } else if (r.store === 'space_plan') planIds.add(r.docKey)
    }

    let documents = 0
    let refs = 0
    const failed = (what: string, message: string): AssetSwapResult => ({
      ok: false,
      error: `${what}: ${message}. ${documents} of the places were rewritten before this; swapping again picks up the rest.`,
    })

    for (const page of pageKeys.values()) {
      let q = admin.from('pages').select('id, data, published_data').eq('slug', page.slug)
      if (page.spaceId) q = q.eq('space_id', page.spaceId)
      const { data: row, error } = await q.maybeSingle()
      if (error) return failed(`Page ${page.slug}`, error.message)
      if (!row) continue
      const draft = swapAssetRefs(row.data, from, to)
      const live = swapAssetRefs(row.published_data, from, to)
      if (draft.swapped + live.swapped === 0) continue
      const patch: { data?: Json; published_data?: Json } = {}
      if (draft.swapped > 0) patch.data = draft.value as Json
      if (live.swapped > 0) patch.published_data = live.value as Json
      const { error: writeErr } = await admin.from('pages').update(patch).eq('id', row.id)
      if (writeErr) return failed(`Page ${page.slug}`, writeErr.message)
      documents += 1
      refs += draft.swapped + live.swapped
    }

    for (const spaceId of spaceIds) {
      const { data: row, error } = await admin.from('spaces').select('id, preferences').eq('id', spaceId).maybeSingle()
      if (error) return failed('Space', error.message)
      if (!row) continue
      const out = swapSpacePreferences(row.preferences, from, to)
      if (out.swapped === 0) continue
      const { error: writeErr } = await admin
        .from('spaces')
        .update({ preferences: out.preferences as Json })
        .eq('id', row.id)
      if (writeErr) return failed('Space', writeErr.message)
      documents += 1
      refs += out.swapped
    }

    for (const planId of planIds) {
      const { data: row, error } = await admin.from('space_plans').select('id, files').eq('id', planId).maybeSingle()
      if (error) return failed('Plan', error.message)
      if (!row) continue
      const out = swapPlanFiles(row.files, from, to)
      if (out.swapped === 0) continue
      const { error: writeErr } = await admin.from('space_plans').update({ files: out.files as Json }).eq('id', row.id)
      if (writeErr) return failed('Plan', writeErr.message)
      documents += 1
      refs += out.swapped
    }

    return { ok: true, documents, refs, places }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Swap failed.' }
  }
}
