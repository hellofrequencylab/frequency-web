// Post embeddings — the content half of the feed's interest signal (LIVE-677). One 384-d gte-small
// vector per top-level post, built from its body, stored in post_embeddings (migration
// 20270346002300). Mirrors lib/events/embeddings.ts: a cheap cron backfill (no insert trigger),
// newest first so what the feed is showing now is covered first, a missing row is the cursor.
//
// Server-only (admin client). Degrades gracefully: never throws, no-ops with AI off.

import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from '@/lib/ai/embed'

/** pgvector wants a bracketed literal for a vector parameter over PostgREST. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

/** The text a post is embedded from: its body, trimmed and capped. Null when there is nothing to
 *  say (a photo-only post), so it is skipped rather than embedded as noise. PURE. */
export function buildPostText(body: string | null | undefined): string | null {
  const text = (body ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000)
  return text.length >= 12 ? text : null
}

/**
 * Embed recent top-level posts that have no vector yet, newest first. Hidden posts and replies are
 * skipped: neither is ranked in the feed. Best-effort per post; returns how many were embedded and
 * how many candidates were looked at.
 */
export async function backfillPostEmbeddings(limit = 100): Promise<{ embedded: number; candidates: number }> {
  let embedded = 0
  let candidates = 0
  try {
    const client = createAdminClient()
    const { data: rows } = await client
      .from('posts')
      .select('id, body')
      .is('parent_id', null)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      // Over-fetch: most of the newest posts already have a vector, so skip those below.
      .limit(Math.max(1, limit) * 3)
    const posts = (rows ?? []) as Array<{ id: string; body: string | null }>
    if (posts.length === 0) return { embedded: 0, candidates: 0 }

    const { data: existing } = await client
      .from('post_embeddings')
      .select('post_id')
      .in('post_id', posts.map((p) => p.id))
    const have = new Set(((existing ?? []) as Array<{ post_id: string }>).map((r) => r.post_id))

    const todo = posts.filter((p) => !have.has(p.id)).slice(0, Math.max(1, limit))
    candidates = todo.length
    for (const p of todo) {
      const text = buildPostText(p.body)
      if (!text) continue
      try {
        const embedding = await embedText(text)
        await client
          .from('post_embeddings')
          .upsert({ post_id: p.id, embedding: toVectorLiteral(embedding), updated_at: new Date().toISOString() })
        embedded++
      } catch {
        /* skip; the next run retries this post */
      }
    }
  } catch {
    /* best-effort */
  }
  return { embedded, candidates }
}
