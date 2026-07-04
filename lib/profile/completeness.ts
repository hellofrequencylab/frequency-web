// Profile completeness (ADR-516 Phase B) — a PURE helper over the profile fields the rail already reads
// (app/(main)/settings/rail-getters.ts getProfileRailData) plus the Spotlight flags. No IO, no query: it
// scores a bundle the caller already fetched, so the Hub can show a "profile complete" stat and a single
// on-canon nudge for the biggest gap without any new instrumentation.
//
// The scored items are the seven public profile fields + one Spotlight item (turning Spotlight on). Each
// counts equally toward the percentage. `gaps` lists the unfilled items in FIX-FIRST order (the most
// impactful first), each with a member-facing, on-canon nudge line (docs/CONTENT-VOICE.md: camp-counselor
// voice, no em dashes; docs/NAMING.md: Spotlight is a proper noun) the Hub can surface verbatim.

/** The inputs the completeness score reads — a subset of the profile rail bundle + the Spotlight flags. */
export interface CompletenessInput {
  displayName?: string | null
  handle?: string | null
  bio?: string | null
  avatarUrl?: string | null
  headerImageUrl?: string | null
  city?: string | null
  website?: string | null
  spotlightEnabled?: boolean | null
}

/** One scored profile item + the nudge to fill it. */
export interface CompletenessGap {
  /** Stable field key (for tests + deep-linking). */
  field: string
  /** A member-facing, on-canon nudge to fill this gap (no em dashes; Spotlight is a proper noun). */
  nudge: string
}

export interface CompletenessResult {
  /** Whole-number percent 0..100 (filled / total, rounded). */
  percent: number
  /** How many items are filled. */
  filled: number
  /** Total scored items. */
  total: number
  /** The unfilled items, most-impactful first; `gaps[0]` is the biggest gap for the single Hub nudge. */
  gaps: readonly CompletenessGap[]
}

/** Whether a text field counts as filled (a non-blank string). */
function has(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

// The scored items in FIX-FIRST order: the most visible, page-completing gaps first, so `gaps[0]` is the
// nudge worth showing. Each nudge is one plain line in the camp-counselor voice (no feelings-narration,
// no em dashes).
const ITEMS: readonly {
  field: string
  filled: (i: CompletenessInput) => boolean
  nudge: string
}[] = [
  { field: 'headerImageUrl', filled: (i) => has(i.headerImageUrl), nudge: 'Add a header image so your page looks finished.' },
  { field: 'avatarUrl', filled: (i) => has(i.avatarUrl), nudge: 'Add a profile photo so people recognize you.' },
  { field: 'bio', filled: (i) => has(i.bio), nudge: 'Write a short bio so people know what you are about.' },
  { field: 'displayName', filled: (i) => has(i.displayName), nudge: 'Add your name so people know who you are.' },
  { field: 'city', filled: (i) => has(i.city), nudge: 'Add your city so nearby people can find you.' },
  { field: 'website', filled: (i) => has(i.website), nudge: 'Add a link so people can find your work.' },
  { field: 'handle', filled: (i) => has(i.handle), nudge: 'Pick a handle so people can find your page.' },
  { field: 'spotlight', filled: (i) => i.spotlightEnabled === true, nudge: 'Turn on your Spotlight to share a page of your own.' },
]

/**
 * Score a profile bundle for completeness. PURE — no IO. `percent` is filled/total rounded to a whole
 * number; `gaps` lists the unfilled items in fix-first order, so `gaps[0]` is the single biggest gap the
 * Hub nudges on. An empty bundle scores 0; a fully filled one scores 100 with no gaps.
 */
export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const total = ITEMS.length
  const gaps: CompletenessGap[] = []
  let filled = 0
  for (const item of ITEMS) {
    if (item.filled(input)) filled += 1
    else gaps.push({ field: item.field, nudge: item.nudge })
  }
  const percent = Math.round((filled / total) * 100)
  return { percent, filled, total, gaps }
}
