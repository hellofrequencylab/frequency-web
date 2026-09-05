// Help-center content, the DEPENDENCY-FREE half.
//
// WHY THIS FILE IS SPLIT FROM content.ts. `help-index.yml` re-embeds the help centre into
// `help_chunks` on every merge to main that touches `content/help/**`, and it deliberately runs
// with NO `pnpm install` — the pipeline reads local Markdown with `fs` and embeds over HTTP, so a
// full install would be pure cost. That reasoning was correct and then quietly stopped being true:
// content.ts later gained `import { cache } from 'react'` for per-request memoisation (a real win
// for the app), and from that moment the indexer died on
// `ERR_MODULE_NOT_FOUND: Cannot find package 'react'` before doing any work.
//
// It failed on EVERY push to main from at least 2026-08-13 to 2026-08-18 and nobody noticed, because
// the help PAGES render straight from Markdown — only AI search goes stale, and stale search looks
// exactly like search. See ADR-1078.
//
// THE RULE: this module may import node builtins and nothing else. `lib/help/content-core.test.ts`
// asserts it, so the next react/next import lands as a failing test instead of a silent gap in
// search. Everything React-aware lives in content.ts, which composes what is here.

// Help-center content layer: the single, presentation-neutral source for the
// public help center. Help articles live in git as Markdown with front-matter
// under `content/help/<category>/<article>.md`, so they version with the code
// and ship in the same PR as the feature they document (see docs/HELP-CENTER.md).
//
// This module reads + parses that content on the server (fs). It is the "contract"
// the routes render, mirroring lib/contract: pages get typed data, never raw files.
// No third-party docs framework, no MDX webpack coupling: owned and portable.

import { promises as fs } from 'node:fs'
import path from 'node:path'

const HELP_DIR = path.join(process.cwd(), 'content', 'help')

export type HelpStatus = 'published' | 'draft'

export interface HelpArticle {
  category: string
  slug: string
  title: string
  description: string
  order: number
  /** ISO date (YYYY-MM-DD) the article was last reviewed/updated. */
  updated: string
  /** Who the article is written for (member / host / guide / janitor / partner). */
  audience: string
  /** Optional community-role tag (member / crew / host / guide / mentor). When set,
   *  the article belongs to that role's advancement-training curriculum (ADR-224):
   *  the curated path a member walks when promoted INTO that role. Undefined for the
   *  vast majority of articles — purely additive, behavior-preserving when absent. */
  role?: string
  /** Code areas this article documents; powers drift detection (docs/HELP-CENTER.md). */
  featureKeys: string[]
  status: HelpStatus
  body: string
  /** Q&A pairs DERIVED from the body's FAQ section, for FAQPage schema (CONTENT-VOICE §8b:
   *  "FAQPage schema on every article with an FAQ"). Empty for articles without one.
   *
   *  Derived, never hand-kept: a second list would drift from the prose it claims to mirror,
   *  and a FAQPage that disagrees with the visible page is a structured-data violation rather
   *  than a cosmetic bug. `extractFaq` reads the rendered body, so the schema is true by
   *  construction. */
  faq: { q: string; a: string }[]
}

/** Pull `### Question?` / answer pairs out of an article's FAQ section.
 *
 *  Shape it matches (all 16 FAQ-bearing articles today): an `##` heading whose text starts with
 *  Questions / Common questions / FAQ / Frequently asked, then one `###` per question, each
 *  followed by prose up to the next heading. Stops at the next `##` so a later section is never
 *  swallowed. Returns [] when there is no FAQ section, which is the common case.
 *
 *  Deliberately conservative: a `###` that is not a question (no trailing `?`) is skipped rather
 *  than guessed at, because a wrong Question node is worse than a missing one. */
export function extractFaq(body: string): { q: string; a: string }[] {
  const lines = body.split('\n')
  const start = lines.findIndex((l) =>
    /^##\s+(questions|common questions|faq|frequently asked)/i.test(l.trim()),
  )
  if (start === -1) return []

  const out: { q: string; a: string }[] = []
  let q: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (!q) return
    // Strip markdown emphasis/links/code so the schema carries the words a reader sees.
    const a = buf
      .join(' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (a) out.push({ q, a })
    q = null
    buf = []
  }

  for (const line of lines.slice(start + 1)) {
    const t = line.trim()
    if (/^##\s/.test(t) && !/^###/.test(t)) break // next top-level section ends the FAQ
    const h3 = t.match(/^###\s+(.*\?)\s*$/)
    if (h3) {
      flush()
      q = h3[1].replace(/[*_`]/g, '').trim()
      continue
    }
    if (/^#{1,6}\s/.test(t)) {
      flush()
      continue
    }
    if (q && t) buf.push(t)
  }
  flush()
  return out
}

export interface HelpCategory {
  slug: string
  title: string
  description: string
  order: number
  articles: HelpArticle[]
}

export interface HelpSearchEntry {
  title: string
  description: string
  category: string
  categoryTitle: string
  href: string
  excerpt: string
}

type FrontMatter = Record<string, string | string[]>

/** Minimal front-matter parser (key: value, and inline [a, b] arrays). Owned, no
 *  gray-matter dependency; our front-matter is deliberately simple. */
function parseFrontMatter(raw: string): { data: FrontMatter; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const data: FrontMatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    const rawVal = line.slice(idx + 1).trim()
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      data[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      data[key] = rawVal.replace(/^["']|["']$/g, '')
    }
  }
  return { data, content: match[2].trim() }
}

const str = (v: string | string[] | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : fallback
const arr = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v ? [v] : []

async function readCategoryMeta(
  slug: string
): Promise<{ title: string; description: string; order: number }> {
  try {
    const raw = await fs.readFile(path.join(HELP_DIR, slug, '_category.json'), 'utf8')
    const j = JSON.parse(raw) as { title?: string; description?: string; order?: number }
    return { title: j.title ?? slug, description: j.description ?? '', order: j.order ?? 99 }
  } catch {
    return { title: slug, description: '', order: 99 }
  }
}

async function readArticle(category: string, file: string): Promise<HelpArticle> {
  const raw = await fs.readFile(path.join(HELP_DIR, category, file), 'utf8')
  const { data, content } = parseFrontMatter(raw)
  return {
    category,
    slug: file.replace(/\.mdx?$/, ''),
    title: str(data.title, file),
    description: str(data.description),
    order: Number(str(data.order, '99')) || 99,
    updated: str(data.updated),
    audience: str(data.audience, 'member'),
    role: str(data.role) || undefined,
    featureKeys: arr(data.featureKeys),
    status: (str(data.status, 'published') as HelpStatus) === 'draft' ? 'draft' : 'published',
    body: content,
    faq: extractFaq(content),
  }
}

// Read + parse EVERY category and article from disk ONCE per request (drafts included),
// memoized with React cache(). The help center is static, bundled Markdown, yet getSearchIndex,
// getAllCategories, getAllArticles, and getArticle each re-walked + re-parsed it — so a single
// page render (layout getAllCategories + getSearchIndex + a page's getArticle) parsed the whole
// tree 2–3×, and the (main) shell parsed it on every authed navigation. cache() collapses all of
// that to one parse per render pass. Draft-filtering + empty-category pruning stay in the public
// getters below, so their behavior is byte-for-byte unchanged.
/** Read + parse EVERY category and article from disk (drafts included). Uncached on purpose:
 *  memoisation is a request-scoped concern and belongs to the caller. content.ts wraps this in
 *  React `cache()`; a CLI script calls it once and exits. */
export async function loadCategoriesFromDisk(): Promise<HelpCategory[]> {
  let dirents: string[]
  try {
    dirents = (await fs.readdir(HELP_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  const cats = await Promise.all(
    dirents.map(async (slug): Promise<HelpCategory> => {
      const meta = await readCategoryMeta(slug)
      const files = (await fs.readdir(path.join(HELP_DIR, slug))).filter((f) => /\.mdx?$/.test(f))
      const articles = await Promise.all(files.map((f) => readArticle(slug, f)))
      articles.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      return { slug, ...meta, articles }
    })
  )
  return cats.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

/** Copy-on-filter (never mutate the loaded arrays): drop drafts unless asked, then drop any
 *  category left with no visible articles. */
export function selectCategories(
  cats: HelpCategory[],
  opts: { includeDrafts?: boolean } = {}
): HelpCategory[] {
  const visible = opts.includeDrafts
    ? cats
    : cats.map((c) => ({ ...c, articles: c.articles.filter((a) => a.status === 'published') }))
  return visible.filter((c) => c.articles.length > 0)
}

export function helpHref(category: string, slug: string): string {
  return `/help/${category}/${slug}`
}

/** Flat, serializable index for the client-side search box. Pure over already-loaded categories. */
export function searchIndexFrom(cats: HelpCategory[]): HelpSearchEntry[] {
  return cats.flatMap((c) =>
    c.articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: c.slug,
      categoryTitle: c.title,
      href: helpHref(c.slug, a.slug),
      excerpt: a.body
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#>*`_[\]()|-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160),
    }))
  )
}
