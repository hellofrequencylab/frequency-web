// ── RETIRED WORDS CANNOT BE TYPED BACK IN ─────────────────────────────────────────────
//
// docs/NAMING.md is a LOCKED canon, and the live header menu still said "Interests" for
// /discover/topics — a word that canon retires by name: "The SEVEN topics are **Channels**,
// never 'Interests'" and "'Interests' is RETIRED as a member-facing word for these."
//
// It got there through the Menu Manager. Every code path respects the canon; the label field
// did not, because a text input has no opinion. `scripts/check-canon.mjs` could never have
// caught it either — that guard scans `content/**` in the repo, and this string lives in a
// database row that CI has no access to.
//
// So the guard goes where the drift enters: the server action that writes the label. A save
// that would introduce a retired term is rejected with the canon's own replacement in the
// message, so the operator is told what to type instead of being told no.
//
// PURE + framework independent, so the action, its test, and any future CI sweep over the
// nav source all share ONE list. Adding a term is one row here.

/** One retired term: what not to say, what to say instead, and where it is written down. */
export type RetiredTerm = {
  /** Matched case-insensitively on word boundaries against the whole label. */
  pattern: RegExp
  /** The retired word, for the message. */
  term: string
  /** The canon replacement. */
  use: string
  /** Where the rule is locked, so the message can cite it. */
  source: string
}

export const RETIRED_TERMS: readonly RetiredTerm[] = [
  {
    // The one that actually shipped. Pillar > Channel > Circle is the locked three-layer
    // model; "Interests" was the pre-canon word for the middle layer.
    pattern: /\binterests?\b/i,
    term: 'Interests',
    use: 'Channels',
    source: 'docs/NAMING.md (Pillars vs Channels, locked June 2026)',
  },
  {
    // The same canon reserves "Marketplace": the commerce umbrella row is **Market**
    // (ADR-937 superseded ADR-868's label).
    pattern: /\bmarketplace\b/i,
    term: 'Marketplace',
    use: 'Market',
    source: 'docs/NAMING.md (ADR-937)',
  },
  {
    // Pillars are never Channels and never Domains — the inverse of the first rule, and the
    // one a well-meaning editor is most likely to trip while "fixing" the first.
    pattern: /\bdomains?\b/i,
    term: 'Domains',
    use: 'Pillars',
    source: 'docs/NAMING.md (Pillars vs Channels, locked June 2026)',
  },
]

/** The canon problem with this label, or null when it is clean. PURE. */
export function canonViolation(label: string): RetiredTerm | null {
  for (const rule of RETIRED_TERMS) if (rule.pattern.test(label)) return rule
  return null
}

/**
 * A human message for a rejected label — names the word, the replacement, and the doc, so an
 * operator can fix it without going to ask someone. Voice: plain, no em dashes, no scolding.
 */
export function canonRejection(label: string): string | null {
  const hit = canonViolation(label)
  if (!hit) return null
  return `"${hit.term}" is a retired name. Use "${hit.use}" instead. See ${hit.source}.`
}
