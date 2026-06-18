import { cache } from 'react'
import { isSafeRoute } from '@/lib/layout/page-chrome'
import { parseLayout, layoutScopeChain, pickLayoutConfig, type LayoutConfig } from './layout'

// The per-route page settings reader. Like loadChromeOverrides: a service-role read so it
// works regardless of the caller's RLS context, REQUEST-CACHED (React.cache, by route arg),
// and FAIL-SAFE — null on ANY error. So the (main) layout's generateMetadata (and any caller)
// falls back to the code defaults and nothing breaks. `page_settings` is in the generated DB
// types now, so the admin client is used directly; the non-literal SELECT keeps a row-shape cast.

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

export const loadPageSettings = cache(async (route: string): Promise<PageSettingsRow | null> => {
  try {
    if (!isSafeRoute(route)) return null
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const db = createAdminClient()
    const { data, error } = await db.from('page_settings').select(SELECT).eq('route', route).maybeSingle()
    if (error) return null
    return (data as PageSettingsRow | null) ?? null
  } catch {
    return null
  }
})

/** The operator-set WIDE header/banner image for a route (or null). Cached via loadPageSettings,
 *  so the page header + metadata share one read. */
export async function getPageHeaderImage(route: string): Promise<string | null> {
  const row = await loadPageSettings(route)
  return row?.header_image_url?.trim() || null
}

/** The effective LAYOUT config for a route, resolved across the SCOPE CASCADE (ADR-271): the
 *  exact route → its section ('/seg/*') → the global default ('*'), most-specific wins. One
 *  service-role `.in()` read, REQUEST-CACHED, and FAIL-SAFE (empty config on any error) so a
 *  page falls back to the registry default. Role gates ride inside the returned config. */
export const loadLayoutForRoute = cache(async (route: string): Promise<LayoutConfig> => {
  const empty: LayoutConfig = { template: 'single', slots: {} }
  try {
    if (!isSafeRoute(route)) return empty
    const chain = layoutScopeChain(route)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const db = createAdminClient()
    const { data, error } = await db.from('page_settings').select('route, layout').in('route', chain)
    if (error || !data) return empty
    const byKey: Record<string, LayoutConfig> = {}
    for (const row of data) byKey[row.route] = parseLayout(row.layout)
    return pickLayoutConfig(chain, byKey)
  } catch {
    return empty
  }
})
