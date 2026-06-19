import { cache } from 'react'
import { isSafeRoute } from '@/lib/layout/page-chrome'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { parseLayout, layoutScopeChain, pickLayoutConfig, spaceCacheKey, type LayoutConfig } from './layout'

// The per-route page settings reader. Like loadChromeOverrides: a service-role read so it
// works regardless of the caller's RLS context, REQUEST-CACHED (React.cache), and FAIL-SAFE —
// null on ANY error. So the (main) layout's generateMetadata (and any caller) falls back to
// the code defaults and nothing breaks.
//
// SPACE-SCOPED (Phase 0.5a, ENTITY-SPACES-BUILD §B.4): page_settings is re-keyed from `route`
// to `(space_id, route)`. Every read carries a spaceId — DEFAULTING to the ROOT space (the
// canary: single-tenant callers keep reading the root's rows, exactly as today). The
// React.cache keys are now `(spaceId, route)` (via spaceCacheKey), so a layout/SEO row saved
// for space A can never be served from space B's cache slot (the §4.1 invisible-leak guard),
// and every query is filtered by space_id so cross-tenant rows never resolve.
//
// `space_id` is not in the generated DB types yet — the column is added by the Phase 0.5a
// migration. Per the codebase pattern (ADR-246) the new column is reached with untyped casts
// (the `.eq('space_id', …)` filter + the payload cast in actions.ts), not a client cast.

export interface PageSettingsRow {
  route: string
  seo_title: string | null
  seo_description: string | null
  /** Compact social-share / OG image (link previews). */
  og_image_url: string | null
  /** Wide page header / banner image. */
  header_image_url: string | null
  status: string
  visibility_role: string | null
  layout: unknown
}

const SELECT = 'route, seo_title, seo_description, og_image_url, header_image_url, status, visibility_role, layout'

/** Resolve the effective tenant for a read: the explicit spaceId, else the root space. */
async function resolveSpaceId(spaceId?: string | null): Promise<string | null> {
  return spaceId ?? (await loadRootSpaceId())
}

// The cached core, keyed by the (spaceId, route) string so each tenant gets its own cache slot.
const loadPageSettingsCached = cache(
  async (_cacheKey: string, spaceId: string, route: string): Promise<PageSettingsRow | null> => {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      // space_id isn't in the generated types yet — reach it with an untyped client (ADR-246).
      const q = db.from('page_settings') as unknown as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
          }
        }
      }
      const { data, error } = await q.select(SELECT).eq('space_id', spaceId).eq('route', route).maybeSingle()
      if (error) return null
      return (data as PageSettingsRow | null) ?? null
    } catch {
      return null
    }
  },
)

/** The per-route page settings for a space (defaults to the root space). REQUEST-CACHED by
 *  (spaceId, route) and FAIL-SAFE (null on any error / missing tenant). */
export async function loadPageSettings(route: string, spaceId?: string | null): Promise<PageSettingsRow | null> {
  if (!isSafeRoute(route)) return null
  const sid = await resolveSpaceId(spaceId)
  if (!sid) return null
  return loadPageSettingsCached(spaceCacheKey(sid, route), sid, route)
}

/** The operator-set WIDE header/banner image for a route (or null). Cached via loadPageSettings,
 *  so the page header + metadata share one read. */
export async function getPageHeaderImage(route: string, spaceId?: string | null): Promise<string | null> {
  const row = await loadPageSettings(route, spaceId)
  return row?.header_image_url?.trim() || null
}

// The cascade core, keyed by (spaceId, route). One service-role `.eq(space_id).in(route, chain)`
// read scoped to the tenant, then most-specific-wins over the route/section/global chain.
const loadLayoutForRouteCached = cache(
  async (_cacheKey: string, spaceId: string, route: string): Promise<LayoutConfig> => {
    const empty: LayoutConfig = { template: 'single', slots: {} }
    try {
      const chain = layoutScopeChain(route)
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()
      // space_id isn't in the generated types yet — reach it with an untyped client (ADR-246).
      const q = db.from('page_settings') as unknown as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            in: (col: string, vals: readonly string[]) => Promise<{ data: { route: string; layout: unknown }[] | null; error: unknown }>
          }
        }
      }
      const { data, error } = await q.select('route, layout').eq('space_id', spaceId).in('route', chain)
      if (error || !data) return empty
      const byKey: Record<string, LayoutConfig> = {}
      for (const row of data) byKey[row.route] = parseLayout(row.layout)
      return pickLayoutConfig(chain, byKey)
    } catch {
      return empty
    }
  },
)

/** The effective LAYOUT config for a route in a space (defaults to the root space), resolved
 *  across the SPACE -> ROUTE -> SECTION -> GLOBAL cascade (ENTITY-SPACES-BUILD §B.4): the
 *  space dimension is the row filter; within the space the exact route → its section ('/seg/*')
 *  → the global default ('*') decide most-specific-wins. REQUEST-CACHED by (spaceId, route) and
 *  FAIL-SAFE (empty config on any error) so a page falls back to the registry default. */
export async function loadLayoutForRoute(route: string, spaceId?: string | null): Promise<LayoutConfig> {
  const empty: LayoutConfig = { template: 'single', slots: {} }
  if (!isSafeRoute(route)) return empty
  const sid = await resolveSpaceId(spaceId)
  if (!sid) return empty
  return loadLayoutForRouteCached(spaceCacheKey(sid, route), sid, route)
}
