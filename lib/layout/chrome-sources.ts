import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { CHROME_CACHE_TAGS, crossRequestCached } from '@/lib/cross-request-cache'
import { parseChromeOverrideRows, type ChromeOverrideRow, type ChromeOverrides } from './page-chrome'
import { parseAppOverrideRows, type AppOverrides, type RawAppOverrideRow } from '@/lib/apps/overrides'

// ── The SHELL's reads of the two operator chrome tables, cached across requests (ADR-1243) ─────
//
// `page_chrome_overrides` (which rail frames a route) and `app_overrides` (which Apps a scope's
// admin rail shows, in what order, behind what role) are identical for every viewer and change
// only when an operator saves in /admin/page-layout. The (main) layout read both on every member
// page view. Now it reads them here: React `cache` dedupes inside one request, and `unstable_cache`
// keeps the rows across requests until the manager's write path invalidates the tag.
//
// WHY A SEPARATE MODULE. `lib/layout/page-chrome.ts` and `lib/apps/overrides.ts` are client-safe
// on purpose: `railFor`, `mergeChrome` and the App helpers are imported by 'use client' modules
// (app-shell, settings-panel, the admin bar), and each keeps its Supabase dependency behind a
// dynamic import so the pure half stays out of the browser. `next/cache` must not follow that
// dynamic import into a client async chunk, so the cached readers live HERE, `server-only`, and
// only the server layout imports them. The two direct loaders stay where they are for the EDITOR
// pages, which should read the row an operator just saved without waiting on any cache.
//
// The validation is shared, not copied: both readers run the same pure parser after the boundary
// (`parseChromeOverrideRows` / `parseAppOverrideRows`), so a row the cache stored is re-validated
// on every request exactly as the direct read validates it.

/** The stored `page_chrome_overrides` rows. THROWS on a query error so a failure is never cached. */
const chromeOverrideRows = crossRequestCached(
  async (): Promise<ChromeOverrideRow[]> => {
    const { data, error } = await createAdminClient().from('page_chrome_overrides').select('route, rail')
    if (error) throw new Error(`page_chrome_overrides query failed: ${error.message}`)
    return data ?? []
  },
  ['page-chrome', 'overrides'],
  { tags: [CHROME_CACHE_TAGS.pageChrome] },
)

/** The shell's chrome override map: the same answer as `loadChromeOverrides`, cached across
 *  requests. FAIL-SAFE `{}` on any error, so the resolver falls back to the code chrome map. */
export const loadCachedChromeOverrides = cache(async (): Promise<ChromeOverrides> => {
  try {
    return parseChromeOverrideRows(await chromeOverrideRows())
  } catch {
    return {}
  }
})

/** The stored `app_overrides` rows for one scope kind (space_id IS NULL, the scope-kind defaults).
 *  Keyed by `scopeKey`, so one scope's rail can never be served as another's. THROWS on error. */
const appOverrideRows = crossRequestCached(
  async (scopeKey: string): Promise<RawAppOverrideRow[]> => {
    // app_overrides isn't in the generated types until its migration is applied + typegen re-runs,
    // so reach it with an untyped client (the ADR-246 pattern used for page_settings / new tables).
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            is: (
              col: string,
              val: null,
            ) => Promise<{ data: RawAppOverrideRow[] | null; error: { message?: string } | null }>
          }
        }
      }
    }
    const { data, error } = await db
      .from('app_overrides')
      .select('app_id, enabled, position, min_role')
      .eq('scope_key', scopeKey)
      .is('space_id', null)
    if (error) throw new Error(`app_overrides query failed: ${error.message ?? 'unknown'}`)
    return data ?? []
  },
  ['app-overrides', 'scope'],
  { tags: [CHROME_CACHE_TAGS.appOverrides] },
)

/** The shell's App override map for a scope: the same answer as `loadAppOverrides`, cached across
 *  requests. FAIL-SAFE `{}` on any error, so the rail falls back to the catalog defaults. */
export const loadCachedAppOverrides = cache(async (scopeKey: string): Promise<AppOverrides> => {
  try {
    return parseAppOverrideRows(await appOverrideRows(scopeKey))
  } catch {
    return {}
  }
})
