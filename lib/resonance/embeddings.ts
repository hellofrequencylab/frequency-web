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

// ── Per-member signal assembly + the nightly batch (wired into app/api/cron/refresh-traits) ──────
// The cron seeds/refreshes one embedding per opted-in member AFTER the resonance edges step. Best-
// effort + FAIL-SAFE by construction: a no-op when AI is off or the table/extension is absent, and
// every read here degrades to empty rather than throwing, so the trait refresh always completes.

/** Build ONE person's ResonanceContentSignal from the graph Frequency already has: the Pillar names
 *  behind their adopted practices, their Journey plan titles, and their practice titles. Mirrors the
 *  traversal in lib/resonance/candidates.ts (loadAnchorEdges) but resolves human NAMES, since the
 *  embedding is over text. FAIL-SAFE: empty arrays on any error (embedPerson then no-ops on empty). */
export async function buildPersonSignal(profileId: string): Promise<ResonanceContentSignal> {
  const empty: ResonanceContentSignal = { pillars: [], journeys: [], practices: [] }
  if (!profileId) return empty
  try {
    const admin = createAdminClient()
    const [journeyRows, practiceRows] = await Promise.all([
      admin.from('journey_enrollments').select('plan_id').eq('profile_id', profileId),
      admin.from('member_practices').select('practice_id').eq('profile_id', profileId).eq('active', true),
    ])
    const planIds = [...new Set(((journeyRows.data ?? []) as { plan_id: string }[]).map((r) => r.plan_id))]
    const practiceIds = [...new Set(((practiceRows.data ?? []) as { practice_id: string }[]).map((r) => r.practice_id))]

    // Resolve the names. Each branch is independently fail-safe (empty on error).
    const [journeys, { practiceTitles, pillarIds }] = await Promise.all([
      (async (): Promise<string[]> => {
        if (planIds.length === 0) return []
        const { data } = await admin.from('journey_plans').select('title').in('id', planIds)
        return ((data ?? []) as { title: string | null }[]).map((r) => r.title ?? '').filter(Boolean)
      })(),
      (async (): Promise<{ practiceTitles: string[]; pillarIds: string[] }> => {
        if (practiceIds.length === 0) return { practiceTitles: [], pillarIds: [] }
        const { data } = await admin.from('practices').select('title, domain_id').in('id', practiceIds)
        const rows = (data ?? []) as { title: string | null; domain_id: string | null }[]
        return {
          practiceTitles: rows.map((r) => r.title ?? '').filter(Boolean),
          pillarIds: [...new Set(rows.map((r) => r.domain_id).filter((x): x is string => !!x))],
        }
      })(),
    ])

    let pillars: string[] = []
    if (pillarIds.length > 0) {
      const { data } = await admin.from('pillars').select('name').in('id', pillarIds)
      pillars = ((data ?? []) as { name: string | null }[]).map((r) => r.name ?? '').filter(Boolean)
    }

    return { pillars, journeys, practices: practiceTitles }
  } catch {
    return empty
  }
}

/** Whether the embedding table is REACHABLE (exists), regardless of row count. The WRITE path needs
 *  this, NOT embeddingLayerAvailable() (which needs an existing row and so would deadlock cold-start
 *  seeding). FAIL-SAFE: false on any error or absence (the pre-migration / no-pgvector state). */
export async function resonanceLayerWritable(): Promise<boolean> {
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { head: boolean; count: 'exact' }) => {
          limit: (n: number) => Promise<{ error: unknown }>
        }
      }
    }
    const { error } = await admin.from('resonance_embeddings').select('profile_id', { head: true, count: 'exact' }).limit(0)
    return !error
  } catch {
    return false
  }
}

/**
 * The nightly resonance-embedding batch. For each opted-in member (resonance_consent.opted_in),
 * builds their ResonanceContentSignal and upserts an embedding via embedPerson. Bounded, sequential,
 * best-effort + FAIL-SAFE: a no-op when AI is off (no spend) or the table/extension is absent
 * (pre-migration), and any per-member or batch error is swallowed so it NEVER breaks the trait
 * refresh. Returns counts for logging.
 *
 * authz-delegated: platform-wide nightly write, no per-caller scope by design (like the trait /
 * edge refresh). Consent is enforced here (only opted_in members are embedded).
 */
export async function refreshResonanceEmbeddings(opts: { limitMembers?: number } = {}): Promise<{ members: number; embedded: number }> {
  let members = 0
  let embedded = 0
  try {
    // Kill switch + table-reachable gate: skip cleanly (no spend, no error) when either is off.
    if (!(await aiAvailable())) return { members: 0, embedded: 0 }
    if (!(await resonanceLayerWritable())) return { members: 0, embedded: 0 }

    const limitMembers = Math.max(1, Math.min(2000, opts.limitMembers ?? 500))
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: boolean) => { limit: (n: number) => Promise<{ data: { profile_id: string }[] | null; error: unknown }> }
        }
      }
    }
    const { data: optedIn, error } = await admin
      .from('resonance_consent')
      .select('profile_id')
      .eq('opted_in', true)
      .limit(limitMembers)
    if (error || !optedIn || optedIn.length === 0) return { members: 0, embedded: 0 }

    for (const { profile_id: pid } of optedIn) {
      members += 1
      const signal = await buildPersonSignal(pid)
      const ok = await embedPerson(pid, signal) // FAIL-SAFE: no-op on empty signal / absent table.
      if (ok) embedded += 1
    }
    return { members, embedded }
  } catch {
    return { members, embedded }
  }
}
