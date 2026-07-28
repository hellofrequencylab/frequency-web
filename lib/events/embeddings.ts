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
import { seriesKey } from '@/lib/events/series'

// ── ONE VECTOR PER SERIES, ON THE ANCHOR ID (ADR-897 E2) ────────────────────────────────────────
//
// A repeating event is materialised as real rows (ADR-007), and INHERITED_COLUMNS
// (lib/event-recurrence.ts) copies title, description, category and energy_tag to every occurrence
// verbatim. buildEventText below is exactly those four fields and CONTAINS NO DATE — so every
// occurrence of a series produced a BYTE-IDENTICAL 384-d vector. The index was carrying up to ~61
// copies of one weekly cowork series' vector and paying embedText for each of them.
//
// So the row we key on is the SERIES key (parent_event_id ?? id), never the occurrence's own id.
//
// 🔴 THIS ONLY WORKS BECAUSE THE READER FANS BACK OUT. lib/events/matching.ts (E1, same change set)
// looks a row's vector up by its own id AND its series key, own-id first. Narrowing the writer
// without that reader in place is a SILENT failure: every occurrence's interest score drops to
// zero, no error and no log, and the blend just loses its 45% interest term. The two ship together
// or not at all.
//
// Existing per-occurrence rows are left alone here. They stay correct (the own-id lookup still
// finds them), they are simply redundant, so the cleanup is a script a human reads first —
// scripts/adr-897-prune-occurrence-embeddings.sql — not a migration.

function db(): SupabaseClient {
  return createAdminClient()
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
  /** ADR-897: null on an anchor or a one-off, the anchor's id on a materialised occurrence. */
  parent_event_id?: string | null
}

/** The columns both readers below need. One constant so the SELECT can never lose
 *  `parent_event_id` — without it `seriesKey` silently reads every occurrence as its own series
 *  and the de-duplication this module exists for quietly stops happening. */
const EMBED_SELECT = 'id, title, description, category, energy_tag, parent_event_id'

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
      .select(EMBED_SELECT)
      .eq('id', eventId)
      .maybeSingle()
    const event = data as EmbeddableEvent | null
    if (!event) return

    const text = buildEventText(event)
    if (!text) return // nothing descriptive to embed yet

    const embedding = await embedText(text)
    // Keyed on the SERIES, so an occurrence handed to this function re-embeds its anchor's row
    // rather than minting a duplicate the reader would have to fall back past. The upsert is why
    // this is safe to call for an occurrence at all: worst case it refreshes text that is
    // identical by construction.
    await client
      .from('event_embeddings')
      .upsert({
        event_id: seriesKey({ ...event, starts_at: null }),
        embedding: toVectorLiteral(embedding),
        updated_at: new Date().toISOString(),
      })
  } catch {
    /* best-effort: matching simply falls back to its non-semantic signals */
  }
}

/**
 * Embed published/upcoming SERIES that are missing embeddings, soonest first so the nearest
 * gatherings are covered first. Driven by the embed-events cron. Best-effort per series; returns
 * how many were embedded.
 *
 * The unit of work is a series, not a row (see the module header): a daily cowork series is one
 * embedText call and one `event_embeddings` row on its anchor, not ~61 identical ones.
 *
 * "Missing" rather than "stale": events.created_at is the only durable timestamp today, so a row
 * that already exists is skipped to keep the batch cheap. Re-embedding after an edit is
 * embedEvent's job, called inline by the orchestrator.
 */
export async function backfillEventEmbeddings(limit = 100): Promise<{ embedded: number }> {
  let embedded = 0
  try {
    const client = db()
    const now = new Date().toISOString()

    // Candidate upcoming, non-cancelled, PUBLISHED events. `status` is new here: a draft never
    // needs a vector, it is not listed anywhere the matcher scores, and it re-enters this batch the
    // day it publishes.
    const { data: eventRows } = await client
      .from('events')
      .select(EMBED_SELECT)
      .eq('is_cancelled', false)
      .eq('status', 'published')
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      // Over-fetch: we skip already-embedded ones below, and a series' ~61 rows now collapse to one
      // unit of work, so a batch that used to be spent re-embedding one daily series reaches real
      // events again.
      .limit(Math.max(1, limit) * 3)
    const events = (eventRows ?? []) as EmbeddableEvent[]
    if (events.length === 0) return { embedded: 0 }

    // Collapse to ONE unit of work per series, keyed on the anchor id. Reading the text off
    // whichever row we happen to hold is exact, not an approximation: the materialiser copies all
    // four source fields to every occurrence verbatim.
    //
    // 🔴 This is also why the candidate read does NOT simply filter to anchor rows, which the
    // earlier draft did. An anchor whose OWN starts_at has passed is invisible to
    // `.gte('starts_at', now)` forever, so a long-running weekly series that somehow lacked a
    // vector (AI off the day it was created, an embedText failure) could never acquire one and
    // would sit permanently unmatchable. Going through the live occurrences keeps the series
    // self-healing while still writing exactly one row, on the anchor.
    const bySeries = new Map<string, EmbeddableEvent>()
    for (const e of events) {
      if (!e.id) continue
      const key = seriesKey({ ...e, starts_at: null })
      if (!bySeries.has(key)) bySeries.set(key, e)
    }

    // …minus the ones already embedded (cheap set diff; no left-join over PostgREST).
    const keys = [...bySeries.keys()]
    const { data: existing } = await client
      .from('event_embeddings')
      .select('event_id')
      .in('event_id', keys)
    const haveEmbedding = new Set(((existing ?? []) as { event_id: string }[]).map((r) => r.event_id))

    const todo = keys.filter((k) => !haveEmbedding.has(k)).slice(0, Math.max(1, limit))
    for (const key of todo) {
      const e = bySeries.get(key)
      if (!e) continue
      const text = buildEventText(e)
      if (!text) continue
      try {
        const embedding = await embedText(text)
        await client
          .from('event_embeddings')
          .upsert({ event_id: key, embedding: toVectorLiteral(embedding), updated_at: new Date().toISOString() })
        embedded++
      } catch {
        /* skip; the next run retries this series */
      }
    }
  } catch {
    /* best-effort */
  }
  return { embedded }
}
