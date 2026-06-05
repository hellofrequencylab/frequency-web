// Help index ingestion — chunks the help center markdown (content/help/**) and
// embeds each chunk into `help_chunks`, the table the "Ask Vera" RAG retrieves from
// (lib/ai/help-rag.ts). This pipeline was missing, so the table sat empty and Vera
// always deflected; building it is the fix. Idempotent + content-hashed: unchanged
// chunks are skipped (no re-embed spend), stale chunks are removed. Run it from the
// AI admin (button) or the nightly cron (app/api/cron/embed-help). Server-only.

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllArticles, type HelpArticle } from '@/lib/help/content'
import { embedText } from './embed'

type ChunkInput = { category: string; slug: string; heading: string; content: string }

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32)

// Split an article into retrieval chunks: the intro (before the first `## `) plus
// one chunk per H2 section. Each chunk is prefixed with the article title (and the
// section heading) so it reads as a standalone, well-contextualized passage.
function chunkArticle(a: HelpArticle): ChunkInput[] {
  const body = a.body.trim()
  if (!body) return []
  const parts = body.split(/\n(?=##\s)/)
  const chunks: ChunkInput[] = []
  for (const part of parts) {
    const m = part.match(/^##\s+(.+?)\s*\n/)
    const heading = m ? m[1].trim() : ''
    const text = (m ? part.slice(m[0].length) : part).trim()
    if (!text) continue
    const prefix = a.title + (heading ? ` — ${heading}` : '')
    chunks.push({ category: a.category, slug: a.slug, heading, content: `${prefix}\n${text}`.slice(0, 4000) })
  }
  if (chunks.length === 0) {
    chunks.push({ category: a.category, slug: a.slug, heading: '', content: `${a.title}\n${body}`.slice(0, 4000) })
  }
  return chunks
}

export interface ReindexResult {
  articles: number
  chunks: number
  embedded: number
  skipped: number
  removed: number
  /** All counts are numbers — lets the result flow straight into log fields. */
  [k: string]: number
}

/** (Re)build the help_chunks index from the published help articles. Embeds only
 *  new/changed chunks (content-hash), removes chunks that no longer exist. */
export async function reindexHelpChunks(): Promise<ReindexResult> {
  const admin = createAdminClient() as unknown as SupabaseClient
  const articles = (await getAllArticles()).filter((a) => a.status === 'published')
  const desired = articles.flatMap(chunkArticle)

  const { data: existingRows } = await admin
    .from('help_chunks')
    .select('category, slug, heading, content_hash')
  const existing = new Map<string, string>()
  for (const r of (existingRows ?? []) as { category: string; slug: string; heading: string; content_hash: string }[]) {
    existing.set(`${r.category}|${r.slug}|${r.heading}`, r.content_hash)
  }

  const keep = new Set<string>()
  let embedded = 0
  let skipped = 0
  for (const c of desired) {
    const key = `${c.category}|${c.slug}|${c.heading}`
    keep.add(key)
    const h = hash(c.content)
    if (existing.get(key) === h) {
      skipped++
      continue
    }
    const embedding = await embedText(c.content)
    await admin.from('help_chunks').upsert(
      {
        category: c.category,
        slug: c.slug,
        heading: c.heading,
        content: c.content,
        content_hash: h,
        embedding: `[${embedding.join(',')}]`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'category,slug,heading' },
    )
    embedded++
  }

  // Drop chunks that are no longer produced (deleted articles / renamed sections).
  let removed = 0
  for (const key of existing.keys()) {
    if (keep.has(key)) continue
    const [category, slug, heading] = key.split('|')
    await admin.from('help_chunks').delete().eq('category', category).eq('slug', slug).eq('heading', heading)
    removed++
  }

  return { articles: articles.length, chunks: desired.length, embedded, skipped, removed }
}
