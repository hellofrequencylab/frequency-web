// Practice embeddings — the semantic half of the Phase-1 hybrid retrieval
// (docs/PRACTICE-LIBRARY.md §5, ADR-438). One 384-d gte-small vector per practice,
// built from title + summary + body, stored on practices.embedding (HNSW). Fused
// with the full-text search_vector by search_practices_hybrid() (RRF).
//
// Server-only (admin client). The embedding column predates the regenerated DB types
// for the rest of Phase 1, so writes go through the untyped admin handle (ADR-246, repo
// convention — see lib/events/embeddings.ts). Degrades gracefully: embedPractice never
// throws and no-ops when AI/embeddings are unavailable, so createPractice/updatePractice
// can call it inline without ever blocking or breaking the write.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from '@/lib/ai/embed'
import { aiAvailable } from '@/lib/ai/usage'

function db(): SupabaseClient {
  return createAdminClient()
}

/** pgvector wants a bracketed literal for a vector parameter over PostgREST. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

type EmbeddablePractice = {
  id: string
  title: string | null
  summary: string | null
  body: string | null
}

/** Compose the embedding source text from a practice's descriptive fields. Pure.
 *  Mirrors the search_vector generated column (title + summary + body) so the two
 *  retrieval halves index the same text. */
export function buildPracticeText(
  p: Pick<EmbeddablePractice, 'title' | 'summary' | 'body'>,
): string {
  return [p.title, p.summary, p.body]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000)
}

/**
 * Embed ONE practice and write the vector onto practices.embedding (384-d). Called
 * inline by createPractice / updatePractice. Degrades gracefully: a no-op when AI is
 * off or the embed/write fails — never throws into the caller (best-effort, so a
 * practice write is never blocked or broken by an embedding hiccup).
 */
export async function embedPractice(practiceId: string): Promise<void> {
  try {
    if (!(await aiAvailable())) return // respect the AI kill switch — no spend while off
    const client = db()

    const { data } = await client
      .from('practices')
      .select('id, title, summary, body')
      .eq('id', practiceId)
      .maybeSingle()
    const practice = data as EmbeddablePractice | null
    if (!practice) return

    const text = buildPracticeText(practice)
    if (!text) return // nothing descriptive to embed yet

    const embedding = await embedText(text)
    await client
      .from('practices')
      .update({ embedding: toVectorLiteral(embedding) })
      .eq('id', practiceId)
  } catch {
    /* best-effort: hybrid search simply falls back to its full-text half */
  }
}

/**
 * Embed practices that are missing an embedding, newest first. Driven by the
 * embed-practices cron (mirrors backfillEventEmbeddings). Best-effort per practice;
 * returns how many were embedded. Skips archived rows (they never surface in search).
 *
 * The embedding column lives ON practices (not a side table), so "missing" = the column
 * is null. We read candidates through the untyped admin handle and filter for a null
 * embedding via PostgREST's `.is('embedding', null)`.
 */
export async function backfillPracticeEmbeddings(limit = 100): Promise<{ embedded: number }> {
  let embedded = 0
  try {
    const client = db()
    const { data: rows } = await client
      .from('practices')
      .select('id, title, summary, body')
      .is('embedding', null)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, limit))
    const practices = (rows ?? []) as EmbeddablePractice[]
    if (practices.length === 0) return { embedded: 0 }

    for (const p of practices) {
      const text = buildPracticeText(p)
      if (!text) continue
      try {
        const embedding = await embedText(text)
        await client
          .from('practices')
          .update({ embedding: toVectorLiteral(embedding) })
          .eq('id', p.id)
        embedded++
      } catch {
        /* skip; the next run retries this practice */
      }
    }
  } catch {
    /* best-effort */
  }
  return { embedded }
}
