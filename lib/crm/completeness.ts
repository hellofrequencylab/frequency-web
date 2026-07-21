// Roster COMPLETENESS scoring (Resonance CRM). A "complete" row is a real, rich person — a name, a
// phone, a company, and so on — versus the bare email-only rows a CSV import drops in by the hundred.
// The space Resonance roster sorts on this (the "Most complete" sort, its default) so the contacts you
// actually filled out float above the email-only leads. PURE + framework-free (no Supabase / React), so
// it is trivially unit-testable and safe to import anywhere. Voice: internal signal, no member-facing copy.

/** The presence flags that make a roster row complete. Each `true` flag adds its weight. All optional so a
 *  caller only sets what it knows (an absent flag counts as not-present). */
export interface CompletenessSignals {
  /** A real display name, NOT just the email local-part. The strongest "this is a real contact" signal. */
  hasRealName?: boolean
  hasPhone?: boolean
  hasCompany?: boolean
  hasTitle?: boolean
  hasCity?: boolean
  hasWebsite?: boolean
  hasTags?: boolean
  hasNotes?: boolean
  /** Any imported custom fields (contacts.meta.custom). */
  hasCustomFields?: boolean
  /** Stitched to (or is) a real platform profile — a known member, not a cold lead. */
  isMember?: boolean
  hasAvatar?: boolean
  /** Any engagement signal (an engagement score, or seen recently). */
  hasActivity?: boolean
}

/** Weight per signal. Identity (name / member / phone / company) dominates; the softer fields add polish.
 *  The exact numbers are not load-bearing — only the ORDER they induce (rich rows above bare ones). */
const WEIGHTS: Record<keyof CompletenessSignals, number> = {
  hasRealName: 3,
  isMember: 3,
  hasPhone: 2,
  hasCompany: 2,
  hasTitle: 1,
  hasCity: 1,
  hasWebsite: 1,
  hasTags: 1,
  hasNotes: 1,
  hasCustomFields: 1,
  hasAvatar: 1,
  hasActivity: 1,
}

/** The maximum score any row can reach (sum of every weight). */
export const MAX_COMPLETENESS = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0)

/** Score a row's completeness signals: the weighted count of filled fields. Higher = more complete, so a
 *  `direction: 'desc'` sort on this value floats the richest rows to the top. PURE, total, deterministic. */
export function completenessScore(signals: CompletenessSignals): number {
  let score = 0
  for (const key of Object.keys(WEIGHTS) as (keyof CompletenessSignals)[]) {
    if (signals[key]) score += WEIGHTS[key]
  }
  return score
}

/** Whether a raw display name is a REAL name rather than the email's local-part (what an email-only import
 *  falls back to). Empty / whitespace / an exact case-insensitive match of the local-part all read false.
 *  PURE. */
export function isRealName(displayName: string | null | undefined, email: string | null | undefined): boolean {
  const name = (displayName ?? '').trim()
  if (!name) return false
  const localPart = (email ?? '').split('@')[0]?.trim() ?? ''
  return name.toLowerCase() !== localPart.toLowerCase()
}
