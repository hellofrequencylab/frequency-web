// Shared help-search scoring — a lightweight, owned substring matcher used by
// both the help-center search box and the app-wide support launcher. No backend,
// no search SaaS; the index is small. If it ever grows, swap the impl here and
// every caller benefits (see docs/HELP-CENTER.md, docs/SUPPORT-SYSTEM.md).
//
// Type-only import of HelpSearchEntry keeps this client-safe (content.ts uses fs).
import type { HelpSearchEntry } from './content'

/** Score an entry against a query. Title hits weigh most; any term miss = 0. */
export function scoreHelpEntry(entry: HelpSearchEntry, q: string): number {
  const hay = `${entry.title} ${entry.description} ${entry.categoryTitle} ${entry.excerpt}`.toLowerCase()
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  let s = 0
  for (const t of terms) {
    if (entry.title.toLowerCase().includes(t)) s += 5
    else if (hay.includes(t)) s += 1
    else return 0
  }
  return s
}

/** Top-N matches for a query, ranked. Returns [] for queries under 2 chars. */
export function searchHelp(index: HelpSearchEntry[], query: string, limit = 8): HelpSearchEntry[] {
  const q = query.trim()
  if (q.length < 2) return []
  return index
    .map((e) => ({ e, s: scoreHelpEntry(e, q) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.e)
}
