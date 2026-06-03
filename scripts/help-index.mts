// Help-index pipeline: embed every published help article (chunked by heading)
// via the gte-small Edge Function and upsert into help_chunks. Idempotent — sets
// updated_at to the run start and prunes any chunk older than that (i.e. removed).
// Runs in CI on merge to main (docs/SUPPORT-SYSTEM.md §5). Service-role only.
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node --experimental-strip-types scripts/help-index.mts

import { createHash } from 'node:crypto'
import { getAllCategories } from '../lib/help/content.ts'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✖ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// Split an article into chunks by H2/H3 headings; prepend title + heading so each
// chunk carries its context into the embedding.
function chunkArticle(title: string, body: string): { heading: string; content: string }[] {
  const chunks: { heading: string; content: string }[] = []
  let heading = ''
  let buf: string[] = []
  const flush = () => {
    const text = buf.join('\n').trim()
    if (text) chunks.push({ heading, content: `${title}${heading ? ` — ${heading}` : ''}\n\n${text}` })
    buf = []
  }
  for (const line of body.split('\n')) {
    const m = line.match(/^#{2,3}\s+(.*)/)
    if (m) {
      flush()
      heading = m[1].trim()
    } else {
      buf.push(line)
    }
  }
  flush()
  if (chunks.length === 0) chunks.push({ heading: '', content: `${title}\n\n${body.trim()}` })
  return chunks
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${URL}/functions/v1/embed`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`)
  const { embedding } = (await res.json()) as { embedding: number[] }
  return embedding
}

async function main() {
  const runStart = new Date().toISOString()
  const cats = await getAllCategories() // published only
  const rows: Record<string, unknown>[] = []

  for (const cat of cats) {
    for (const a of cat.articles) {
      for (const ch of chunkArticle(a.title, a.body)) {
        const embedding = await embed(ch.content)
        rows.push({
          category: cat.slug,
          slug: a.slug,
          heading: ch.heading,
          content: ch.content,
          content_hash: createHash('sha256').update(ch.content).digest('hex'),
          embedding: `[${embedding.join(',')}]`,
          updated_at: runStart,
        })
      }
    }
  }

  const up = await fetch(`${URL}/rest/v1/help_chunks?on_conflict=category,slug,heading`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!up.ok) throw new Error(`upsert ${up.status}: ${await up.text()}`)

  // Prune chunks that weren't refreshed this run (deleted/renamed sections).
  const del = await fetch(`${URL}/rest/v1/help_chunks?updated_at=lt.${encodeURIComponent(runStart)}`, {
    method: 'DELETE',
    headers: { ...auth, Prefer: 'return=minimal' },
  })
  if (!del.ok) throw new Error(`prune ${del.status}: ${await del.text()}`)

  console.log(`✅ Indexed ${rows.length} chunks from ${cats.reduce((n, c) => n + c.articles.length, 0)} articles.`)
}

main().catch((e) => {
  console.error('✖ help:index failed:', e)
  process.exit(1)
})
