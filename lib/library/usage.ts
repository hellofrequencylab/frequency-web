import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { pathForSlug } from '@/lib/page-editor/data'

// ─────────────────────────────────────────────────────────────────────────────
// THE USAGE INDEX (PROG-D4, ADR-1502): "which pages use this asset?"
//
// The read half of the seam ADR-1130 opened. A block document stores an asset
// as { assetId, url } (lib/library/asset-ref.ts); this module asks the database
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
// authz-delegated: this is a READ. `library_asset_usage` is a SECURITY INVOKER function that
// only SELECTs, revoked from every browser role and granted to service_role alone, so the admin
// client is the only way the read can reach it at all (scripts/function-grants.txt: internal).
// The gate lives at both call sites: usage-actions.ts and actions.ts carry
// requireAdmin('janitor', { staff: 'marketing' }), the Loom Studio door (LIVE-289). The authz
// scan classes any `.rpc(` as a mutation because it cannot read the function body; this one is
// the read-only-RPC shape lib/analytics/marketing-intel.ts is allowlisted for.
// ─────────────────────────────────────────────────────────────────────────────

/** One row of `library_asset_usage`, as PostgREST returns it. */
export type AssetUsageRow = {
  store: 'pages' | 'space_page' | 'space_layout' | string
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
  const id = (assetId ?? '').trim()
  if (!UUID_RE.test(id)) return { ok: true, pages: 0, refs: 0, places: [] }
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
    return summarizeUsageRows(Array.isArray(data) ? data : [])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Usage lookup failed.' }
  }
}
