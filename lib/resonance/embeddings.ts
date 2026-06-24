// Resonance embeddings (Resonance Engine Phase 4 · ADR-385 · docs/NEXT-GEN-CRM.md
// "The Resonance Graph" -> "Embedding retrieval"). The BEST-EFFORT content layer over the reliable
// graph-traversal baseline (lib/resonance/candidates.ts): one 384-d gte-small resonance embedding
// per person, built from their content signal (the Pillars / Journeys / practices they engage), so
// two members with no shared edge but a clearly shared taste can still surface as a candidate.
//
// CRITICAL — FAIL-SAFE BY CONSTRUCTION (the non-negotiable rule for this phase). The `vector`
// extension, the `resonance_embeddings` table, and its column DO NOT EXIST until the migration
// applies + pgvector is enabled. So EVERY function here:
//   • never throws into its caller (try/catch around all IO),
//   • returns a SAFE EMPTY result (no embedding, no neighbours) when the table/extension is absent,
//   • is a NO-OP when AI is off (the kill switch) so it never spends while disabled.
// The candidate generator + the cron call these inline; when this layer is unavailable the engine
// degrades to graph-traversal candidates only and the product still works. The embedding is purely
// additive precision, never a dependency.
//
// Server-only (admin client). resonance_embeddings is not in the generated DB types until it is
// regenerated (ADR-246), so it is reached through an untyped cast (the lib/events/embeddings.ts +
// lib/ai/room-search.ts convention). The 384-d gte-small model + the bracketed-literal vector
// parameter + the hnsw vector_cosine_ops index all mirror lib/events/embeddings.ts exactly.
//
// authz-delegated: this is the nightly, platform-wide embedding refresh (no per-caller scope by
// design, like lib/traits/refresh.ts). The match READS that consume the neighbours are consent- +
// staff-gated at their call site (lib/resonance/candidates.ts). The embedding is content the member
// already engages; it is classed sensitive in the trait registry and governed by the same machinery.

import { createAdminClient } from '@/lib/supabase/admin'
import { embedText, EMBED_DIM } from '@/lib/ai/embed'
import { aiAvailable } from '@/lib/ai/usage'

/** pgvector wants a bracketed literal for a vector parameter over PostgREST (mirrors
 *  lib/events/embeddings.ts toVectorLiteral). */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

/** The content signal a person's resonance embedding is built from: the names of the Pillars,
 *  Journeys, and practices they engage. Pure text, so the SAME gte-small model embeds it as the
 *  rest of the system. */
export interface ResonanceContentSignal {
  /** Pillar names (Mind / Body / Spirit / Expression) the person engages, via their practices. */
  pillars: string[]
  /** Journey plan titles the person is enrolled in or completed. */
  journeys: string[]
  /** Practice titles the person has adopted. */
  practices: string[]
}

/** Compose the embedding source text from a person's content signal. PURE. Capped so a hostile or
 *  unusually rich profile can never build an unbounded embed payload. */
export function buildResonanceText(s: ResonanceContentSignal): string {
  return [...s.pillars, ...s.journeys, ...s.practices]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000)
}

/**
 * Embed ONE person's content signal and upsert it into resonance_embeddings (384-d). FAIL-SAFE: a
 * no-op when AI is off, when there is nothing to embed, or when the table/extension is absent (the
 * pre-migration state) or any write fails. NEVER throws. Returns true only when a row was written.
 */
export async function embedPerson(profileId: string, signal: ResonanceContentSignal): Promise<boolean> {
  try {
    if (!profileId) return false
    if (!(await aiAvailable())) return false // respect the AI kill switch — no spend while off
    const text = buildResonanceText(signal)
    if (!text) return false // nothing to embed yet (cold start handled by the graph baseline)

    const embedding = await embedText(text)
    if (!Array.isArray(embedding) || embedding.length !== EMBED_DIM) return false

    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        upsert: (row: Record<string, unknown>) => Promise<{ error: unknown }>
      }
    }
    const { error } = await admin.from('resonance_embeddings').upsert({
      profile_id: profileId,
      embedding: toVectorLiteral(embedding),
      updated_at: new Date().toISOString(),
    })
    // A missing table/extension surfaces as an error here; swallow it (the degrade-to-graph path).
    return !error
  } catch {
    // pgvector absent, embed function down, or any write failure: the engine falls back to graph edges.
    return false
  }
}

/** One nearest-neighbour by resonance embedding: a candidate profile + its cosine similarity. */
export interface ResonanceNeighbor {
  profileId: string
  /** Cosine similarity in [0, 1] (1 = identical taste). */
  similarity: number
}

/**
 * The top-K resonance neighbours of a person via the ANN index, or an EMPTY array when the embedding
 * layer is unavailable (no extension / no table / no row for this person / any error). FAIL-SAFE:
 * never throws, so the candidate generator can always fold these in (or fold in nothing) safely. The
 * SECURITY DEFINER RPC `resonance_neighbors` does the cosine search; this is a thin, defensive caller.
 */
export async function nearestNeighbors(profileId: string, limit = 20): Promise<ResonanceNeighbor[]> {
  if (!profileId) return []
  const capped = Math.max(1, Math.min(100, limit))
  try {
    const admin = createAdminClient()
    const { data, error } = await (admin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { profile_id: string; similarity: number | null }[] | null; error: unknown }>
    }).rpc('resonance_neighbors', { _profile_id: profileId, _limit: capped })
    if (error || !data) return []
    return data
      .filter((r) => r.profile_id && r.profile_id !== profileId)
      .map((r) => ({
        profileId: r.profile_id,
        similarity: typeof r.similarity === 'number' && Number.isFinite(r.similarity) ? Math.max(0, Math.min(1, r.similarity)) : 0,
      }))
  } catch {
    return []
  }
}

/**
 * Whether the resonance embedding layer is live (the extension + table + at least one row exist).
 * FAIL-SAFE: false on any error or absence. The cron/candidate generator can branch on this to log
 * whether it is running with the embedding precision layer or the graph-only baseline.
 */
export async function embeddingLayerAvailable(): Promise<boolean> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { head: boolean; count: 'exact' }) => {
          limit: (n: number) => Promise<{ error: unknown; count: number | null }>
        }
      }
    }
    const { error, count } = await admin.from('resonance_embeddings').select('profile_id', { head: true, count: 'exact' }).limit(1)
    if (error) return false
    return (count ?? 0) > 0
  } catch {
    return false
  }
}
