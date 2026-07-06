// The legacy -> console redirect map (P0:6), DERIVED from the registry so it can never drift from the
// IA. Every ConsoleEntry.legacyHrefs entry becomes one redirect target: the workspace route + ?tab=.
// Root hrefs ('/admin/...') redirect to /admin/{route}?tab={id}; space hrefs ('/spaces/[slug]/...')
// redirect to /spaces/{slug}/manage/{route}?tab={id} with the real slug preserved.
//
// PURE (no IO). The redirect layer (a middleware/route, later in P0:6) calls resolveLegacyPath() and
// issues the redirect; this module only owns the mapping + slug substitution.

import { OPERATOR_CONSOLE, type WorkspaceId } from './console'

export interface LegacyTarget {
  scope: 'root' | 'space'
  workspace: WorkspaceId
  /** The workspace route slug (e.g. 'people'). */
  route: string
  /** The subtab id, used as ?tab=. */
  tab: string
}

const SPACE_PREFIX = '/spaces/[slug]/'

/** Build the raw map from the registry: legacy href pattern -> target. Root and space hrefs are kept
 *  as-is (space ones still carry the '[slug]' placeholder, substituted at resolve time). */
function buildMap(): ReadonlyMap<string, LegacyTarget> {
  const map = new Map<string, LegacyTarget>()
  for (const ws of OPERATOR_CONSOLE) {
    for (const tab of ws.subtabs) {
      for (const href of tab.legacyHrefs ?? []) {
        const scope: 'root' | 'space' = href.startsWith(SPACE_PREFIX) ? 'space' : 'root'
        // First writer wins so the mapping is deterministic if two tabs list the same legacy href.
        if (!map.has(href)) map.set(href, { scope, workspace: ws.id, route: ws.route, tab: tab.id })
      }
    }
  }
  return map
}

export const CONSOLE_ROUTE_MAP: ReadonlyMap<string, LegacyTarget> = buildMap()

/** Turn a target + optional slug into the console path. */
function toPath(t: LegacyTarget, slug?: string): string {
  const base = t.scope === 'space' ? `/spaces/${slug}/manage/${t.route}` : `/admin/${t.route}`
  return `${base}?tab=${t.tab}`
}

/** Normalize a real incoming space path to its '[slug]' registry key + capture the slug.
 *  '/spaces/acme/settings/email' -> { key: '/spaces/[slug]/settings/email', slug: 'acme' }. */
function normalizeSpace(path: string): { key: string; slug: string } | null {
  const m = path.match(/^\/spaces\/([^/]+)(\/.*)?$/)
  if (!m) return null
  const slug = m[1]
  const rest = m[2] ?? ''
  return { key: `/spaces/[slug]${rest}`, slug }
}

/** Resolve a legacy path to its console destination, or null if it is not a mapped legacy surface.
 *  Matches the exact href first, then the longest mapped prefix (so '/admin/marketing/campaigns/x'
 *  still lands on the campaigns tab). */
export function resolveLegacyPath(path: string): string | null {
  const clean = path.split('?')[0].replace(/\/$/, '') || '/'

  // Space-scoped paths carry a real slug; normalize to the registry key.
  if (clean.startsWith('/spaces/')) {
    const norm = normalizeSpace(clean)
    if (!norm) return null
    const exact = CONSOLE_ROUTE_MAP.get(norm.key)
    if (exact) return toPath(exact, norm.slug)
    const pref = longestPrefix(norm.key)
    return pref ? toPath(pref, norm.slug) : null
  }

  // Root paths.
  const exact = CONSOLE_ROUTE_MAP.get(clean)
  if (exact) return toPath(exact)
  const pref = longestPrefix(clean)
  return pref ? toPath(pref) : null
}

/** The mapped target whose key is the longest prefix of `key`, if any. */
function longestPrefix(key: string): LegacyTarget | undefined {
  let best: { len: number; target: LegacyTarget } | null = null
  for (const [href, target] of CONSOLE_ROUTE_MAP) {
    if (href.startsWith('/spaces/[slug]') !== key.startsWith('/spaces/[slug]')) continue
    if (key === href || key.startsWith(`${href}/`)) {
      if (!best || href.length > best.len) best = { len: href.length, target }
    }
  }
  return best?.target
}
