// "People you'd click with" for the feed (Resonance Feed Phase 1, ADR-414). A thin
// composition over the existing suggestion engine (lib/people-suggestions.ts) that
// ALSO honors the Phase 0 hide list (suggestion_hidden): anyone the viewer removed
// with the "X" never returns. Real signals only (shared circles + mutual
// connections); empty when there's nothing genuine to suggest.

import { getPeopleSuggestions, type PersonSuggestion } from '@/lib/people-suggestions'
import { getHiddenSuggestionIds } from './viewer-resonance'

export type { PersonSuggestion }

export async function getFeedPeopleSuggestions(
  viewerProfileId: string,
  limit = 3,
): Promise<PersonSuggestion[]> {
  // Over-fetch a little so the hide filter still leaves a full row.
  const [people, hidden] = await Promise.all([
    getPeopleSuggestions(viewerProfileId, limit + 6),
    getHiddenSuggestionIds(viewerProfileId),
  ])
  return people.filter((p) => !hidden.has(p.id)).slice(0, limit)
}
