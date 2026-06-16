// Leader Training content layer — the leader-gated sibling of lib/help/content.ts.
//
// Same shape, same ownership model as the public help center: guides live in git as
// Markdown with front-matter under `content/leader-training/<category>/<doc>.md`, so
// they version with the code and ship in the same PR as the feature they document.
// This module reads + parses that content on the server (fs) and hands the routes
// typed data — it never renders. The routes reuse the help center's <HelpMarkdown>
// renderer and the page-template kit, so there is ONE rendering path, not a bespoke
// one (see app/(main)/lead/training-library/*).
//
// Distinct from the help center on TWO axes:
//   • SURFACE — these docs live behind the host+ /lead gate (requireLeadFloor), not on
//     the public marketing help center. The loader is presentation-neutral; the route's
//     layout enforces the gate (fail-closed).
//   • CONTENT ROOT — content/leader-training, with hrefs under /lead/training-library.
// Kept as its own small module so the live public help center stays untouched.

import { promises as fs } from 'fs'
import path from 'path'

const TRAINING_DIR = path.join(process.cwd(), 'content', 'leader-training')

/** The route base these docs render under (the host+ /lead surface). */
export const TRAINING_BASE = '/lead/training-library'

export type TrainingStatus = 'published' | 'draft'

export interface TrainingDoc {
  category: string
  slug: string
  title: string
  description: string
  order: number
  /** ISO date (YYYY-MM-DD) the doc was last reviewed/updated. */
  updated: string
  /** Who the doc is written for (leader / host / guide / mentor). */
  audience: string
  status: TrainingStatus
  body: string
}

export interface TrainingCategory {
  slug: string
  title: string
  description: string
  order: number
  docs: TrainingDoc[]
}

type FrontMatter = Record<string, string | string[]>

/** Minimal front-matter parser (key: value, and inline [a, b] arrays). Owned, no
 *  gray-matter dependency — our front-matter is deliberately simple, identical to the
 *  help center's contract so a doc can move between the two without reshaping. */
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

async function readCategoryMeta(
  slug: string
): Promise<{ title: string; description: string; order: number }> {
  try {
    const raw = await fs.readFile(path.join(TRAINING_DIR, slug, '_category.json'), 'utf8')
    const j = JSON.parse(raw) as { title?: string; description?: string; order?: number }
    return { title: j.title ?? slug, description: j.description ?? '', order: j.order ?? 99 }
  } catch {
    return { title: slug, description: '', order: 99 }
  }
}

async function readDoc(category: string, file: string): Promise<TrainingDoc> {
  const raw = await fs.readFile(path.join(TRAINING_DIR, category, file), 'utf8')
  const { data, content } = parseFrontMatter(raw)
  return {
    category,
    slug: file.replace(/\.mdx?$/, ''),
    title: str(data.title, file),
    description: str(data.description),
    order: Number(str(data.order, '99')) || 99,
    updated: str(data.updated),
    audience: str(data.audience, 'leader'),
    status: (str(data.status, 'published') as TrainingStatus) === 'draft' ? 'draft' : 'published',
    body: content,
  }
}

export async function getAllTrainingCategories(
  opts: { includeDrafts?: boolean } = {}
): Promise<TrainingCategory[]> {
  let dirents: string[]
  try {
    dirents = (await fs.readdir(TRAINING_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  const cats = await Promise.all(
    dirents.map(async (slug): Promise<TrainingCategory> => {
      const meta = await readCategoryMeta(slug)
      const files = (await fs.readdir(path.join(TRAINING_DIR, slug))).filter((f) => /\.mdx?$/.test(f))
      let docs = await Promise.all(files.map((f) => readDoc(slug, f)))
      if (!opts.includeDrafts) docs = docs.filter((d) => d.status === 'published')
      docs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      return { slug, ...meta, docs }
    })
  )
  return cats
    .filter((c) => c.docs.length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

export async function getAllTrainingDocs(): Promise<TrainingDoc[]> {
  return (await getAllTrainingCategories()).flatMap((c) => c.docs)
}

export async function getTrainingDoc(
  category: string,
  slug: string
): Promise<{ doc: TrainingDoc; category: TrainingCategory } | null> {
  const cat = (await getAllTrainingCategories()).find((c) => c.slug === category)
  if (!cat) return null
  const doc = cat.docs.find((d) => d.slug === slug)
  return doc ? { doc, category: cat } : null
}

export function trainingHref(category: string, slug: string): string {
  return `${TRAINING_BASE}/${category}/${slug}`
}
