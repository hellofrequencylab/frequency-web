// The BROWSER half of the site-icon search (ADR-1002 follow-up, docs/DEPLOY-SAFETY.md rule 2).
//
// 🔴 WHY THIS FILE EXISTS. Resolving a glyph needs the whole installed @iconify-json data for
// Lucide + Phosphor + Tabler: ~7MB of build-time JSON. That search used to be a `'use server'`
// action imported straight into components/loom/loom-picker.tsx, and the picker is the UNIVERSAL
// image popup — a couple of dozen uploaders across the app render it. A server action is imported
// by the CLIENT module, so it fans out with that module: measured 6.87MB x 337 serverless
// functions = 2.3GB, the single largest line in the build's disk budget.
//
// A ROUTE HANDLER is its own function and fans out with nothing, so the collections now live
// behind app/api/site-icons/route.ts and this module is all the picker imports. It holds the
// CONTRACT and the fetch, and nothing heavy — keep it that way. Anything imported here is
// imported by every route that can open the picker.
//
// The trade is one round-trip the first time someone opens the Icons tab, which the picker covers
// with its skeleton grid (docs/INTERACTION-STATES.md §1 "loading").

/** One pickable site icon: its Iconify name ('lucide:zap'), a human label, and a self-contained
 *  SVG data URL to both preview and store. The wire shape of GET /api/site-icons. */
export interface SiteIcon {
  name: string
  label: string
  dataUrl: string
}

/** Widest page the route will serve. Mirrors MAX_LIMIT in app/api/site-icons/route.ts. */
export const SITE_ICON_MAX_LIMIT = 120

/**
 * Search the installed site icon sets over HTTP. Same contract as the server-side
 * `searchSiteIcons`: no query returns the house semantic palette, a query matches glyph names by
 * substring, and it is FAIL-SAFE to [] — a picker that shows no site icons is a picker that still
 * lists the caller's uploaded ones, which beats an exception inside a transition.
 *
 * `signal` is optional: the picker debounces its query rather than aborting, but a caller that
 * unmounts mid-flight should be able to say so.
 */
export async function fetchSiteIcons(
  query = '',
  limit = 60,
  signal?: AbortSignal,
): Promise<SiteIcon[]> {
  try {
    const params = new URLSearchParams()
    const q = query.trim()
    if (q) params.set('q', q)
    params.set('limit', String(Math.min(Math.max(Math.trunc(limit) || 1, 1), SITE_ICON_MAX_LIMIT)))
    const res = await fetch(`/api/site-icons?${params.toString()}`, { signal })
    if (!res.ok) return []
    const body = (await res.json()) as { icons?: unknown }
    return Array.isArray(body.icons) ? (body.icons as SiteIcon[]) : []
  } catch {
    return []
  }
}
