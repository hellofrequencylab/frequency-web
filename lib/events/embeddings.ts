// Event embeddings — the semantic half of the "For You" matching engine
// (docs/EVENTS-SYSTEM.md §3). One 384-d gte-small vector per event, built from
// title + description + category + energy_tag, stored in event_embeddings.
//
// Server-only (admin client). event_embeddings isn't in the generated DB types →
// untyped cast (repo convention, see lib/ai/room-search.ts). Degrades gracefully:
// embedEvent never throws and no-ops when AI/embeddings are unavailable, so the
// orchestrator's createEvent can call it inline without risk.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from '@/lib/ai/embed'
import { aiAvailable } from '@/lib/ai/usage'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** pgvector wants a bracketed literal for a vector parameter over PostgREST. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

type EmbeddableEvent = {
  id: string
  title: string | null
  description: string | null
  category: string | null
  energy_tag: string | null
}

/** Compose the embedding source text from an event's descriptive fields. Pure. */
function buildEventText(e: Pick<EmbeddableEvent, 'title' | 'description' | 'category' | 'energy_tag'>): string {
  return [e.title, e.description, e.category, e.energy_tag]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000)
}

/**
 * Embed ONE event and upsert it into event_embeddings (384-d). Called inline by
 * the orchestrator's createEvent. Degrades gracefully: a no-op when AI is off or
 * the embed/upsert fails — never throws into the caller.
 */
export async function embedEvent(eventId: string): Promise<void> {
  try {
    if (!(await aiAvailable())) return // respect the AI kill switch — no spend while off
    const client = db()

    const { data } = await client
      .from('events')
      .select('id, title, description, category, energy_tag')
      .eq('id', eventId)
      .maybeSingle()
    const event = data as EmbeddableEvent | null
    if (!event) return

    const text = buildEventText(event)
    if (!text) return // nothing descriptive to embed yet

    const embedding = await embedText(text)
    await client
      .from('event_embeddings')
      .upsert({ event_id: eventId, embedding: toVectorLiteral(embedding), updated_at: new Date().toISOString() })
  } catch {
    /* best-effort: matching simply falls back to its non-semantic signals */
  }
}

/**
 * Embed published/upcoming events that are missing or stale embeddings, newest
 * starting first so the soonest events are freshest. Driven by the embed-events
 * cron. Best-effort per event; returns how many were (re)embedded.
 *
 * "Stale" = the event was updated after its embedding (events.created_at is the
 * only durable timestamp today, so we re-embed any upcoming event whose embedding
 * is missing; a row that already exists is skipped to keep the batch cheap).
 */
export async function backfillEventEmbeddings(limit = 100): Promise<{ embedded: number }> {
  let embedded = 0
  try {
    const client = db()
    const now = new Date().toISOString()

    // Candidate upcoming, non-cancelled events…
    const { data: eventRows } = await client
      .from('events')
      .select('id, title, description, category, energy_tag')
      .eq('is_cancelled', false)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(Math.max(1, limit) * 3) // over-fetch; we skip already-embedded ones below
    const events = (eventRows ?? []) as EmbeddableEvent[]
    if (events.length === 0) return { embedded: 0 }

    // …minus the ones already embedded (cheap set diff; no left-join over PostgREST).
    const { data: existing } = await client
      .from('event_embeddings')
      .select('event_id')
      .in('event_id', events.map((e) => e.id))
    const haveEmbedding = new Set(((existing ?? []) as { event_id: string }[]).map((r) => r.event_id))

    const todo = events.filter((e) => !haveEmbedding.has(e.id)).slice(0, Math.max(1, limit))
    for (const e of todo) {
      const text = buildEventText(e)
      if (!text) continue
      try {
        const embedding = await embedText(text)
        await client
          .from('event_embeddings')
          .upsert({ event_id: e.id, embedding: toVectorLiteral(embedding), updated_at: new Date().toISOString() })
        embedded++
      } catch {
        /* skip; the next run retries this event */
      }
    }
  } catch {
    /* best-effort */
  }
  return { embedded }
}
