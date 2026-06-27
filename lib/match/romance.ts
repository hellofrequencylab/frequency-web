// The romance lane (Resonance Feed Phase 5, ADR-419). STRICTLY opt-in and mutual: it
// returns matches ONLY when the viewer turned romance mode on, and only OTHER members
// who also turned it on. Candidates are drawn from the same real-signal suggestion pool
// (shared circles + mutual connections) the platonic strip uses, so romance never
// surfaces a stranger from nowhere. No swipe mechanics. The hide list still applies, and
// astrology (when both opted in) sorts the lane. Empty + harmless for everyone who
// hasn't opted in.

import { createAdminClient } from '@/lib/supabase/admin'
import { getPeopleSuggestions, type PersonSuggestion } from '@/lib/people-suggestions'
import { getHiddenSuggestionIds } from '@/lib/feed/viewer-resonance'
import { getMyMatchPrefs, getMatchPrefsFor } from './prefs'
import { sunSign, signCompatibility } from '@/lib/astrology/signs'

export interface RomanceMatch extends PersonSuggestion {
  verified: boolean
  /** A quiet astrology note when both opted in + have birth dates, else null. */
  astroReason: string | null
}

export interface RomanceLane {
  /** The viewer has romance mode on (drives whether the surface renders at all). */
  enabled: boolean
  /** The viewer is verified. Unverified members can browse but don't appear to others
   *  (ADR-420), so the surface nudges them to verify (show up to an event). */
  viewerVerified: boolean
  people: RomanceMatch[]
}

async function readVerifiedFlags(ids: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  if (ids.length === 0) return out
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, v: string[]) => Promise<{ data: { id: string; verified_at: string | null }[] | null }>
        }
      }
    }
    const { data } = await admin.from('profiles').select('id, verified_at').in('id', ids)
    for (const r of data ?? []) out.set(r.id, r.verified_at != null)
  } catch {
    // fail-safe: nobody verified
  }
  return out
}

export async function getRomanceMatches(viewerProfileId: string, limit = 4): Promise<RomanceLane> {
  const viewerPrefs = await getMyMatchPrefs(viewerProfileId)
  if (!viewerPrefs.romanceMode) return { enabled: false, viewerVerified: false, people: [] }

  const [candidates, hidden, viewerVerifiedMap] = await Promise.all([
    getPeopleSuggestions(viewerProfileId, 30),
    getHiddenSuggestionIds(viewerProfileId),
    readVerifiedFlags([viewerProfileId]),
  ])
  const viewerVerified = viewerVerifiedMap.get(viewerProfileId) ?? false
  const visible = candidates.filter((c) => !hidden.has(c.id))
  if (visible.length === 0) return { enabled: true, viewerVerified, people: [] }

  const prefs = await getMatchPrefsFor(visible.map((c) => c.id))
  // Mutual opt-in only: the other person must ALSO have romance mode on.
  const mutual = visible.filter((c) => prefs.get(c.id)?.romanceMode === true)
  if (mutual.length === 0) return { enabled: true, viewerVerified, people: [] }

  // Verified-to-appear (ADR-420): you only ever SEE verified opt-ins in the romance
  // lane, and an unverified member never appears to anyone.
  const verified = await readVerifiedFlags(mutual.map((c) => c.id))
  const verifiedMutual = mutual.filter((c) => verified.get(c.id) === true)
  if (verifiedMutual.length === 0) return { enabled: true, viewerVerified, people: [] }

  const viewerSign = viewerPrefs.astrologyOptIn ? sunSign(viewerPrefs.birthData?.date) : null

  const scored = verifiedMutual.map((c) => {
    let astroReason: string | null = null
    let astroScore = 0
    if (viewerSign) {
      const cp = prefs.get(c.id)
      const candSign = cp?.astrologyOptIn ? sunSign(cp.birthData?.date) : null
      if (candSign) {
        const r = signCompatibility(viewerSign, candSign)
        astroReason = r.reason
        astroScore = r.score
      }
    }
    return { c, astroReason, astroScore, verified: verified.get(c.id) ?? false }
  })

  scored.sort(
    (a, b) =>
      b.astroScore - a.astroScore ||
      b.c.sharedCircles + b.c.mutualConnections - (a.c.sharedCircles + a.c.mutualConnections),
  )

  return {
    enabled: true,
    viewerVerified,
    people: scored.slice(0, limit).map((s) => ({ ...s.c, verified: s.verified, astroReason: s.astroReason })),
  }
}
