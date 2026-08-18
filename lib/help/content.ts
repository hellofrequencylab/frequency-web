// Help-center content layer: the single, presentation-neutral source for the
// public help center. Help articles live in git as Markdown with front-matter
// under `content/help/<category>/<article>.md`, so they version with the code
// and ship in the same PR as the feature they document (see docs/HELP-CENTER.md).
//
// This module is the REACT-AWARE half. Every read, parse and pure transform lives in
// ./content-core.ts, which imports node builtins and nothing else; this file adds the one
// thing the app needs and a CLI cannot have — request-scoped memoisation. Import the core
// from a script, import this from the app. See ADR-1078 for why the split exists.

import { cache } from 'react'
import {
  loadCategoriesFromDisk,
  selectCategories,
  searchIndexFrom,
  helpHref,
} from './content-core.ts'
import type {
  HelpArticle,
  HelpCategory,
  HelpSearchEntry,
  HelpStatus,
} from './content-core.ts'

export type { HelpArticle, HelpCategory, HelpSearchEntry, HelpStatus }
export { helpHref }

// Read + parse EVERY category and article from disk ONCE per request (drafts included),
// memoized with React cache(). The help center is static, bundled Markdown, yet getSearchIndex,
// getAllCategories, getAllArticles, and getArticle each re-walked + re-parsed it — so a single
// page render (layout getAllCategories + getSearchIndex + a page's getArticle) parsed the whole
// tree 2–3×, and the (main) shell parsed it on every authed navigation. cache() collapses all of
// that to one parse per render pass. Draft-filtering + empty-category pruning stay in the public
// getters below, so their behavior is byte-for-byte unchanged.
const loadCategoriesCached = cache(loadCategoriesFromDisk)

export async function getAllCategories(
  opts: { includeDrafts?: boolean } = {}
): Promise<HelpCategory[]> {
  return selectCategories(await loadCategoriesCached(), opts)
}

export async function getAllArticles(): Promise<HelpArticle[]> {
  return (await getAllCategories()).flatMap((c) => c.articles)
}

export async function getArticle(
  category: string,
  slug: string
): Promise<{ article: HelpArticle; category: HelpCategory } | null> {
  const cat = (await getAllCategories()).find((c) => c.slug === category)
  if (!cat) return null
  const article = cat.articles.find((a) => a.slug === slug)
  return article ? { article, category: cat } : null
}

/** Flat, serializable index for the client-side search box. */
export async function getSearchIndex(): Promise<HelpSearchEntry[]> {
  return searchIndexFrom(await getAllCategories())
}
