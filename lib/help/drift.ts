// Doc-drift mapping — the deterministic spine of the living-docs loop
// (docs/SUPPORT-SYSTEM.md §6, ADR-067). Given the files a code change touched, it
// answers: which help articles might now be stale? That set is what the AI
// doc-writer drafts updates for, and what the staff checklist lists.
//
// Pure + dependency-free (the registry is injected) so it's unit-tested and
// runs under Node's TS type-stripping without import-extension friction.

export interface FeatureRoute {
  key: string
  routes: string[]
}

export interface ArticleRef {
  category: string
  slug: string
  featureKeys: string[]
}

/** Map a repo file path to the app route it implements, or null if it isn't a
 *  route file. Strips the `app/` prefix and `(group)` segments, drops the
 *  filename, and keeps dynamic segments (e.g. `[slug]`) so prefix-matching works.
 *  `app/(main)/circles/[slug]/page.tsx` → `/circles/[slug]`. */
export function fileToRoute(file: string): string | null {
  if (!file.startsWith('app/')) return null
  const segments = file
    .slice('app/'.length)
    .split('/')
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')'))) // drop route groups
  if (segments.length && /\.(tsx?|jsx?)$/.test(segments[segments.length - 1])) segments.pop()
  const route = '/' + segments.join('/')
  return route.replace(/\/+$/, '') || '/'
}

/** Feature keys whose routes are touched by the changed files. A key matches if a
 *  changed file's route equals the key route or sits beneath it. */
export function affectedFeatureKeys(changedFiles: string[], features: FeatureRoute[]): string[] {
  const routes = changedFiles.map(fileToRoute).filter((r): r is string => r !== null)
  const keys = new Set<string>()
  for (const fk of features) {
    const hit = fk.routes.some((kr) => routes.some((r) => r === kr || r.startsWith(kr + '/')))
    if (hit) keys.add(fk.key)
  }
  return [...keys]
}

/** Articles whose featureKeys intersect the keys affected by the changed files —
 *  i.e. the articles a reviewer (or the AI doc-writer) should look at. */
export function affectedArticles<T extends ArticleRef>(
  changedFiles: string[],
  articles: T[],
  features: FeatureRoute[],
): T[] {
  const keys = new Set(affectedFeatureKeys(changedFiles, features))
  if (keys.size === 0) return []
  return articles.filter((a) => a.featureKeys.some((k) => keys.has(k)))
}
