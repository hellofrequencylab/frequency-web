// Server seam for the blended feed rank (Resonance Feed Phase 1, ADR-414). Builds
// the viewer's resonance map — authorId → strength in [0, 1] — that the pure
// blend scorer (lib/feed/blend-rank.ts) reads as its "graph" signal, and the set
// of people the viewer has hidden from suggestions.
//
// Two cheap, request-cached reads compose the map:
//   • the ORBIT (my_orbit RPC): people the viewer has real co-presence with
//     (shared circles + co-events), as a saturating co-presence strength.
//   • the resonance EDGES (resonance_edges): the nightly reciprocal-match graph,
//     whose score is already 0..1. The stronger of the two wins per person.
// Both are fail-safe (empty when resonance is off / a member has no graph yet), so
// the blend simply leans on recency + engagement for that viewer.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyOrbit } from '@/lib/connections/resonance'
import { listEdgesForPerson } from '@/lib/resonance/edges'

/** Saturate a raw co-presence tally into [0, 1): r / (r + K). */
function saturate(raw: number, k = 6): number {
  if (raw <= 0) return 0
  return raw / (raw + k)
}

/**
 * authorId → resonance strength in [0, 1] for the signed-in viewer. The strength
 * is the MAX of the saturated orbit co-presence and the reciprocal match-edge
 * score, so either kind of affinity lifts an author in the feed. Request-cached:
 * the feed reads it once per render. Returns an empty map for an anonymous viewer
 * or when resonance is unavailable.
 */
export const getViewerResonanceMap = cache(
  async (viewerProfileId: string | null): Promise<Map<string, number>> => {
    const map = new Map<string, number>()
    if (!viewerProfileId) return map

    // getMyOrbit runs on the authed client (auth.uid() = this viewer); listEdges is
    // a service-role read scoped to the viewer's id. Independent, so fetch together.
    const [orbit, edges] = await Promise.all([
      getMyOrbit(200).catch(() => []),
      listEdgesForPerson(viewerProfileId, 50).catch(() => []),
    ])

    for (const m of orbit) {
      const s = saturate(m.resonance ?? 0)
      if (s > 0) map.set(m.profileId, Math.max(map.get(m.profileId) ?? 0, s))
    }
    for (const e of edges) {
      const s = e.score
      if (s > 0) map.set(e.otherProfileId, Math.max(map.get(e.otherProfileId) ?? 0, s))
    }
    return map
  },
)

/**
 * The set of profile ids the viewer has hidden from suggestions (the "X" on a
 * suggested person, Phase 0 table `suggestion_hidden`). Request-cached; empty for
 * an anonymous viewer or on any read error (fail-open: a read hiccup never blocks
 * the feed, it just shows the suggestion again next load).
 */
export const getHiddenSuggestionIds = cache(
  async (viewerProfileId: string | null): Promise<Set<string>> => {
    const hidden = new Set<string>()
    if (!viewerProfileId) return hidden
    try {
      // `suggestion_hidden` is reached untyped until lib/database.types.ts regenerates
      // (ADR-246) — same cast pattern as the resonance reads (lib/resonance/edges.ts).
      const admin = createAdminClient() as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => Promise<{ data: { hidden_profile_id: string }[] | null }>
          }
        }
      }
      const { data } = await admin
        .from('suggestion_hidden')
        .select('hidden_profile_id')
        .eq('profile_id', viewerProfileId)
      for (const r of data ?? []) hidden.add(r.hidden_profile_id)
    } catch {
      // fail-open
    }
    return hidden
  },
)
