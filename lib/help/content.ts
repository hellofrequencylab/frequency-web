// Help-center content layer: the single, presentation-neutral source for the
// public help center. Help articles live in git as Markdown with front-matter
// under `content/help/<category>/<article>.md`, so they version with the code
// and ship in the same PR as the feature they document (see docs/HELP-CENTER.md).
//
// This module reads + parses that content on the server (fs). It is the "contract"
// the routes render, mirroring lib/contract: pages get typed data, never raw files.
// No third-party docs framework, no MDX webpack coupling: owned and portable.

import { cache } from 'react'
import { promises as fs } from 'fs'
import path from 'path'

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
  }
}

// Read + parse EVERY category and article from disk ONCE per request (drafts included),
// memoized with React cache(). The help center is static, bundled Markdown, yet getSearchIndex,
// getAllCategories, getAllArticles, and getArticle each re-walked + re-parsed it — so a single
// page render (layout getAllCategories + getSearchIndex + a page's getArticle) parsed the whole
// tree 2–3×, and the (main) shell parsed it on every authed navigation. cache() collapses all of
// that to one parse per render pass. Draft-filtering + empty-category pruning stay in the public
// getters below, so their behavior is byte-for-byte unchanged.
const loadCategoriesFromDisk = cache(async (): Promise<HelpCategory[]> => {
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
})

export async function getAllCategories(
  opts: { includeDrafts?: boolean } = {}
): Promise<HelpCategory[]> {
  const cats = await loadCategoriesFromDisk()
  // Copy-on-filter (never mutate the cached arrays): drop drafts unless asked, then drop any
  // category left with no visible articles — matching the prior behavior exactly.
  const visible = opts.includeDrafts
    ? cats
    : cats.map((c) => ({ ...c, articles: c.articles.filter((a) => a.status === 'published') }))
  return visible.filter((c) => c.articles.length > 0)
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

export function helpHref(category: string, slug: string): string {
  return `/help/${category}/${slug}`
}

/** Flat, serializable index for the client-side search box. */
export async function getSearchIndex(): Promise<HelpSearchEntry[]> {
  const cats = await getAllCategories()
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
