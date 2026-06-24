// Resonance surfacing reads (Resonance Engine Phase 4 · ADR-385). The fail-safe reads the two
// surfaces share: the Person view Resonance tab + the Space cockpit match-suggestions section. Both
// read the PERSISTED edges (lib/resonance/edges.ts), resolve the matched people's display names, and
// carry the plain WHY. A page never recomputes the graph on a request; it reads tonight's edges.
//
// Server-only (admin client). Edges are reached untyped (ADR-246); names come from profiles.
//
// authz-delegated: read-only. The read authority lives at the CALL SITE: the Person view is staff-
// gated (the /admin/marketing layout); the Space cockpit gates on the Space CRM entitlement + owner/
// admin. This module binds every read to the person/Space it was handed and is FAIL-SAFE (empty).

import { createAdminClient } from '@/lib/supabase/admin'
import { listEdgesForPerson } from './edges'
import { getMatchingConsent } from './matches'
import type { ResonanceReason } from './score'

/** One match as a surface renders it: the matched person + the score + the plain WHY. */
export interface SurfaceMatch {
  profileId: string
  name: string
  handle: string | null
  avatarUrl: string | null
  /** The reciprocal score, 0..1 (the surface shows a coarse strength, never a raw decimal). */
  score: number
  reasons: ResonanceReason[]
}

interface ProfileNameRow {
  id: string
  display_name: string | null
  handle: string | null
  avatar_url: string | null
}

/** Resolve display names for a set of profile ids. FAIL-SAFE: an empty map on any error. */
async function resolveNames(profileIds: string[]): Promise<Map<string, ProfileNameRow>> {
  const map = new Map<string, ProfileNameRow>()
  if (profileIds.length === 0) return map
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('profiles').select('id, display_name, handle, avatar_url').in('id', profileIds)
    for (const p of (data ?? []) as ProfileNameRow[]) map.set(p.id, p)
    return map
  } catch {
    return map
  }
}

/**
 * The resonance matches to SURFACE for one person, strongest first. Reads the persisted edges, drops
 * any whose matched person opted out as a target since the edge was written (a last-mile consent
 * check), and resolves names. FAIL-SAFE: an empty list when the person is not opted in, has no edges,
 * or on any error. The caller MUST have authorized the scope.
 */
export async function getResonanceMatchesForPerson(profileId: string, limit = 5): Promise<SurfaceMatch[]> {
  if (!profileId) return []
  try {
    // Respect the anchor's own consent: a person who is not opted in shows no matches at all.
    const consent = await getMatchingConsent(profileId)
    if (!consent.optedIn) return []

    const edges = await listEdgesForPerson(profileId, Math.max(1, Math.min(20, limit)))
    if (edges.length === 0) return []

    const names = await resolveNames(edges.map((e) => e.otherProfileId))
    return edges
      .map((e) => {
        const p = names.get(e.otherProfileId)
        if (!p) return null
        const name = (p.display_name || p.handle || 'A member').trim()
        return {
          profileId: e.otherProfileId,
          name,
          handle: p.handle,
          avatarUrl: p.avatar_url,
          score: e.score,
          reasons: e.reasons,
        }
      })
      .filter((m): m is SurfaceMatch => m !== null)
  } catch {
    return []
  }
}

/** One Space-scoped match suggestion: an anchor member in the Space and one person they resonate with. */
export interface SpaceMatchSuggestion {
  anchorProfileId: string
  anchorName: string
  match: SurfaceMatch
}

/** The profile ids reachable from a Space's CRM (the profile behind a contact whose touches sit in
 *  this space_id). Mirrors lib/dashboard/scores.ts listMembersByFilter scoping. FAIL-SAFE: []. */
async function spaceReachableProfileIds(spaceId: string): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data: spaceRows } = await admin
      .from('contact_interactions')
      .select('subject_id')
      .eq('space_id', spaceId)
      .eq('subject_kind', 'contact')
    const subjectIds = ((spaceRows ?? []) as { subject_id: string }[]).map((r) => r.subject_id)
    if (subjectIds.length === 0) return []
    const { data: contacts } = await admin.from('contacts').select('profile_id').in('id', subjectIds)
    return [
      ...new Set(
        ((contacts ?? []) as { profile_id: string | null }[]).map((c) => c.profile_id).filter((p): p is string => !!p),
      ),
    ]
  } catch {
    return []
  }
}

/**
 * Match suggestions for a Space: the strongest reciprocal matches among the Space's reachable, opted-in
 * members ("people close by with your vibe"). Reads the persisted edges per anchor and keeps the top
 * few overall. FAIL-SAFE: an empty list on any error or when no member has opted in. The caller MUST
 * have verified the Space's CRM entitlement + owner/admin before calling; the spaceId is the scope.
 */
export async function getSpaceMatchSuggestions(spaceId: string, limit = 5): Promise<SpaceMatchSuggestion[]> {
  if (!spaceId) return []
  try {
    const profileIds = await spaceReachableProfileIds(spaceId)
    if (profileIds.length === 0) return []

    const names = await resolveNames(profileIds)
    const suggestions: SpaceMatchSuggestion[] = []
    // Cap the per-Space fan-out so a large Space never does an unbounded number of edge reads.
    for (const anchorId of profileIds.slice(0, 50)) {
      const matches = await getResonanceMatchesForPerson(anchorId, 2)
      const anchorName = (names.get(anchorId)?.display_name || names.get(anchorId)?.handle || 'A member').trim()
      for (const match of matches) suggestions.push({ anchorProfileId: anchorId, anchorName, match })
    }
    suggestions.sort((a, b) => b.match.score - a.match.score)
    return suggestions.slice(0, Math.max(1, Math.min(20, limit)))
  } catch {
    return []
  }
}

/** How many double-opt-in intros in this Space have been ACCEPTED (both tapped yes). Counts accepted
 *  resonance_matches where at least one party is reachable from the Space. FAIL-SAFE: 0 on any error
 *  or when the table is absent (pre-migration). The "Intros accepted" cockpit stat. */
export async function getSpaceAcceptedIntros(spaceId: string): Promise<number> {
  if (!spaceId) return 0
  try {
    const profileIds = await spaceReachableProfileIds(spaceId)
    if (profileIds.length === 0) return 0
    const set = new Set(profileIds)
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          not: (col: string, op: string, val: null) => {
            or: (f: string) => Promise<{ data: { a_pid: string; b_pid: string }[] | null; error: unknown }>
          }
        }
      }
    }
    const inList = profileIds.join(',')
    const { data, error } = await admin
      .from('resonance_matches')
      .select('a_pid, b_pid')
      .not('accepted_at', 'is', null)
      .or(`a_pid.in.(${inList}),b_pid.in.(${inList})`)
    if (error || !data) return 0
    // Count distinct accepted pairs touching the Space (a pair is counted once).
    const seen = new Set<string>()
    for (const r of data) {
      if (set.has(r.a_pid) || set.has(r.b_pid)) seen.add(`${r.a_pid}:${r.b_pid}`)
    }
    return seen.size
  } catch {
    return 0
  }
}

/** A coarse, plain strength label for a 0..1 score (a raw decimal is never shown). PURE. */
export function matchStrengthLabel(score: number): string {
  if (!Number.isFinite(score)) return 'Worth a look'
  if (score >= 0.5) return 'Strong match'
  if (score >= 0.25) return 'Good match'
  return 'Worth a look'
}

/** The plain WHY line for a match, from its reasons. PURE. No em or en dashes. */
export function matchWhyLine(reasons: ResonanceReason[]): string {
  if (reasons.length === 0) return 'You have things in common.'
  return reasons.map((r) => r.label).join(' and ') + '.'
}
