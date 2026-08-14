// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER: the PROSE SAFETY SCAN (docs/BUSINESS-IMPORTER.md §4.2).
// PURE + framework-independent (no React / Next / Supabase / AI), so every rule is
// exhaustively unit-testable with ZERO IO.
//
// WHY THIS EXISTS. Reframe (lib/importer/reframe/apply.ts) tags every string it writes
// kind:'generated', and the prose gate (map.ts prosePublishes) therefore withholds
// tagline / about / story / offering blurbs from every seeded Space until an operator
// clicks Confirm on each one. In production that ritual ran 12 of 12 times and always
// ended the same way (verifiedBy:'human'), while one business shipped with a null
// tagline because a click was missed. The gate was protecting against ONE thing: the
// §4.2 finding that "a commercial claim can hide inside a sentence", e.g. an `about`
// that reads "Massages from $95. Call (555) 123-4567."
//
// SO: scan the sentence. Prose that carries NO commercial claim and NO health claim
// has nothing for the gate to protect, and its ledger entry may be promoted to
// verified so it auto-publishes. Prose that DOES carry a claim keeps today's behaviour
// EXACTLY: it stays kind:'generated', unverified, and withheld until a human confirms.
//
// THE TRUST INVARIANT this file preserves:
//   • It only ever reports on the four PROSE paths (tagline / about / story /
//     offerings[i].blurb). It never touches, names, or clears a COMMERCIAL FACT path
//     (contact.* / rating / offerings[].price), so isCommercialFieldCleared and
//     splitVerified keep their gate untouched.
//   • It is a one-way widening: a CLEAN result lets prose publish; a DIRTY result
//     changes nothing at all, so the failure mode of a missed pattern is the old
//     manual confirm, not a leak.
//   • It reads nothing and writes nothing. The caller decides what to do with the
//     paths, and the ledger is still the only thing the materializer trusts.
//
// PRECISION IS THE WHOLE JOB. Over-flagging restores the manual ritual we are removing;
// under-flagging publishes an unverified claim. The bar: a plain "who we are and what
// it is like to work with us" paragraph is CLEAN. In particular this repo's businesses
// are healers and breathwork practitioners, so heal / healing / wellness / therapy /
// somatic / practitioner are NORMAL VOCABULARY and never flag on their own. Only claim
// SHAPES flag ("clinically proven", "cures anxiety", "guaranteed results").
//
// Every pattern below is anchored / bounded: no unbounded quantifier sits inside another
// quantifier, and no rule carries the `g` flag (a global regex holds lastIndex state and
// would make repeat calls impure). No em dashes in this file (CONTENT-VOICE §10); the
// dash characters inside the patterns are written as escapes for the same reason.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessProfile } from './schema'

/** The kinds of claim that keep prose gated. */
export type ProseClaim = 'price' | 'phone' | 'address' | 'hours' | 'rating' | 'health' | 'superlative'

export interface ProseScanResult {
  /** True when the prose carries no claim, so it is safe to auto-publish. */
  clean: boolean
  /** Every claim kind detected, stable-ordered, de-duplicated. */
  claims: ProseClaim[]
}

/** The stable report order for `claims`, so a result is comparable across runs. */
export const PROSE_CLAIM_ORDER: readonly ProseClaim[] = [
  'price',
  'phone',
  'address',
  'hours',
  'rating',
  'health',
  'superlative',
]

/** One inspectable detection rule: what it catches, in words, plus the pattern that catches it. */
export interface ProseClaimRule {
  claim: ProseClaim
  /** A plain description of the shape, so the rule set reads as documentation. */
  describes: string
  pattern: RegExp
}

// ── Shared fragments (kept as strings so the composed rules stay readable) ─────────────

/** A dash a range can be written with: hyphen, en dash, em dash (escaped, never literal). */
const DASH = '[-\\u2013\\u2014]'

/** Weekday names and their common abbreviations. Bounded with \b so "sunlight" and
 *  "satisfied" cannot match "sun" / "sat". */
const WEEKDAY =
  '(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tues?|weds?|thurs?|fri|sat|sun)\\b'

/** Named conditions a therapeutic CLAIM attaches to ("treats X", "reverses X"). The verb
 *  is what makes it a claim; these nouns never flag on their own. */
const CONDITION =
  '(?:anxiety|depression|ptsd|trauma|adhd|insomnia|chronic\\s+pain|pain|migraines?|burnout|stress|addiction|illnesses|illness|diseases?|symptoms?|conditions?|inflammation|fatigue|arthritis|cancer)'

/** Up to two intervening street-name words, with duration/quantity nouns excluded so
 *  "a 20 minute drive" and "5 minutes down the road" are not read as addresses. */
const STREET_GAP =
  "(?:(?!(?:minutes?|mins?|hours?|hrs?|years?|yrs?|days?|weeks?|months?|blocks?|miles?|seconds?|people|person|clients?|sessions?|spots?|steps?)\\b)[A-Za-z0-9'.-]{2,}\\s+){0,2}"

/** Full-word street types, safe with no intervening name ("123 Street" is still an address shape). */
const STREET_WORD =
  '(?:street|avenue|boulevard|road|drive|lane|highway|parkway|st|ave|rd|blvd|dr|ln|ct|pl|hwy|way)'

// ── The rules (each claim kind, in report order) ──────────────────────────────────────

/**
 * Every detection rule, grouped by claim kind and documented in place. Exported so the
 * rule set is inspectable from a test, a review board, or a console. PURE data.
 */
export const PROSE_CLAIM_RULES: readonly ProseClaimRule[] = [
  // ── price ───────────────────────────────────────────────────────────────────────
  {
    claim: 'price',
    describes: 'a currency symbol against a number ($95, £40, €40)',
    pattern: /[$£€]\s?\d/,
  },
  {
    claim: 'price',
    describes: 'a number against a currency code or name (95 USD, 40 dollars)',
    pattern: /\b\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp|dollars?|pounds?|euros?)\b/i,
  },
  {
    claim: 'price',
    describes:
      '"from" / "starting at" immediately followed by a number (from 95, starting at $40). A bare' +
      ' four-digit year ("practicing from 2011") is not a price.',
    pattern: /\b(?:from|starting\s+at|starts\s+at)\s+(?:just\s+|only\s+)?(?:[$£€]\s?\d|(?![12]\d{3}\b)\d)/i,
  },
  {
    claim: 'price',
    describes: 'a rate: a number attached to per session / per hour / per month (95 per session, 120/hour)',
    pattern: /\d[\d,.]*\s*(?:usd|dollars?)?\s*(?:\/|\bper\b)\s*(?:session|hour|hr|month|class|visit|person)\b/i,
  },
  {
    claim: 'price',
    describes: '"free" adjacent to a number (free 60 minute intro)',
    pattern: /\bfree\b[^.\n]{0,10}\d|\d[^.\n]{0,10}\bfree\b/i,
  },
  {
    claim: 'price',
    describes: 'a percentage discount (20% off, 20 percent off)',
    pattern: /(?:\d\s*%|\bpercent\b)\s*(?:off|discount)\b/i,
  },

  // ── phone ───────────────────────────────────────────────────────────────────────
  {
    claim: 'phone',
    describes: 'a plausible phone number: (555) 123-4567, 555-123-4567, 555.123.4567, +1 555 123 4567',
    pattern: /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/,
  },

  // ── address ─────────────────────────────────────────────────────────────────────
  {
    claim: 'address',
    describes: 'a street-address shape: a number, up to two name words, then a street type (123 Main St)',
    pattern: new RegExp(`\\b\\d{1,6}\\s+${STREET_GAP}${STREET_WORD}\\b`, 'i'),
  },
  {
    claim: 'address',
    describes: 'a unit designator against a number (Suite 200, Ste 3, Unit B12, Apt 4)',
    pattern: /\b(?:suite|ste|unit|apt)\.?\s*#?\s*[A-Za-z]?\d/i,
  },
  {
    claim: 'address',
    describes: 'a "City, ST 12345" zip shape',
    pattern: /\b[A-Z][A-Za-z.'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/,
  },

  // ── hours ───────────────────────────────────────────────────────────────────────
  {
    claim: 'hours',
    describes: 'a clock time with a meridiem (9am, 5 PM)',
    pattern: /\b\d{1,2}(?::[0-5]\d)?\s?[ap]\.?m\.?\b/i,
  },
  {
    claim: 'hours',
    describes: 'a 24-hour clock time (9:00, 17:30)',
    pattern: /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,
  },
  {
    claim: 'hours',
    describes: 'a weekday range (Monday to Friday, Mon-Fri)',
    pattern: new RegExp(`\\b${WEEKDAY}\\s*(?:${DASH}|to|through|thru|until|till)\\s*${WEEKDAY}`, 'i'),
  },
  {
    claim: 'hours',
    describes: 'a weekday adjacent to a time',
    pattern: new RegExp(`\\b${WEEKDAY}[^.\\n]{0,15}\\d{1,2}\\s?(?::[0-5]\\d|[ap]\\.?m\\.?\\b)`, 'i'),
  },
  {
    claim: 'hours',
    describes: 'an always-open claim (open daily, open every day, 24/7)',
    pattern: /\bopen\s+(?:daily|every\s+day|24)\b|\b24\s?\/\s?7\b/i,
  },

  // ── rating ──────────────────────────────────────────────────────────────────────
  {
    claim: 'rating',
    describes: 'a star claim (4.8 stars, 5 star)',
    pattern: /\b\d(?:\.\d)?\s?stars?\b/i,
  },
  {
    claim: 'rating',
    describes: 'a written star claim (five-star, 5-star)',
    pattern: /\b(?:five|5)[\s-]stars?\b/i,
  },
  {
    claim: 'rating',
    describes: 'a score out of five (5/5, rated 4.8 out of 5)',
    pattern: /\b\d(?:\.\d)?\s*(?:\/\s*5|out\s+of\s+5)\b/i,
  },
  {
    claim: 'rating',
    describes: 'a review or rating count (127 reviews, 40+ ratings)',
    pattern: /\b\d[\d,]*\+?\s+(?:reviews?|ratings?|testimonials?)\b/i,
  },
  {
    claim: 'rating',
    describes: '"rated" against a number (rated 5, rated 4.8)',
    pattern: /\brated\b[^.\n]{0,12}\d/i,
  },

  // ── health (claim shapes only, never the wellness vocabulary) ───────────────────
  {
    claim: 'health',
    describes: 'a cure claim (cure, cures, cured). Does not match manicure / secure / curated.',
    pattern: /\bcure[sd]?\b/i,
  },
  {
    claim: 'health',
    describes: 'treating a named condition (treats anxiety, treat chronic pain)',
    pattern: new RegExp(`\\btreats?\\b(?:\\s+[a-z'-]+){0,2}\\s+${CONDITION}\\b`, 'i'),
  },
  {
    claim: 'health',
    describes: 'eliminating or reversing a named condition',
    pattern: new RegExp(`\\b(?:eliminates?|reverses?|removes?)\\b(?:\\s+[a-z'-]+){0,2}\\s+${CONDITION}\\b`, 'i'),
  },
  {
    claim: 'health',
    describes: 'diagnosing (diagnose, diagnoses, diagnosing)',
    pattern: /\bdiagnos(?:e|es|ing)\b/i,
  },
  {
    claim: 'health',
    describes: 'a proof claim (clinically proven, medically proven, proven to)',
    pattern: /\b(?:clinically|medically|scientifically)\s+proven\b|\bproven\s+to\b/i,
  },
  {
    claim: 'health',
    describes: 'a regulatory invocation (FDA)',
    pattern: /\bFDA\b/i,
  },
  {
    claim: 'health',
    describes: 'a guarantee (guaranteed results, guaranteed to)',
    pattern: /\bguarantee[ds]?\s+(?:results|to)\b/i,
  },
  {
    claim: 'health',
    describes: 'a percentage-improvement claim (87% of clients, 40% reduction)',
    pattern: /\b\d{1,3}\s*%\s+(?:of|improvement|reduction|increase|better|faster|fewer|more)\b/i,
  },

  // ── superlative ─────────────────────────────────────────────────────────────────
  {
    claim: 'superlative',
    describes: '"the best ... in <place>" (not "the best in you")',
    pattern:
      /\bthe\s+best\s+(?:[A-Za-z'-]+\s+){0,3}in\s+(?!you\b|us\b|me\b|people\b|everyone\b|each\b|others?\b|them\b|yourself\b)/i,
  },
  {
    claim: 'superlative',
    describes: 'a rank claim (#1, number one)',
    pattern: /#\s?1\b|\bnumber\s+one\b/i,
  },
  {
    claim: 'superlative',
    describes: 'an award or tier claim (award-winning, world-class, leading provider, voted best)',
    pattern: /\baward[\s-]winning\b|\bworld[\s-]class\b|\bleading\s+provider\b|\bvoted\s+best\b/i,
  },
]

// ── The scan ──────────────────────────────────────────────────────────────────────────

/**
 * Scan one string of prose for claims that must stay gated. PURE + total.
 * Returns `clean: true` with an empty `claims` list for undefined / empty / whitespace
 * input, and for any prose that trips no rule. `claims` is de-duplicated and reported in
 * PROSE_CLAIM_ORDER, so two runs over the same text are byte-identical.
 */
export function scanProse(text: string | undefined): ProseScanResult {
  // Normalize the one whitespace character that regularly defeats a \s boundary.
  const t = (text ?? '').replace(/\u00a0/g, ' ')
  if (!t.trim()) return { clean: true, claims: [] }

  const found = new Set<ProseClaim>()
  for (const rule of PROSE_CLAIM_RULES) {
    if (found.has(rule.claim)) continue
    if (rule.pattern.test(t)) found.add(rule.claim)
  }

  const claims = PROSE_CLAIM_ORDER.filter((c) => found.has(c))
  return { clean: claims.length === 0, claims }
}

// ── The prose paths on a draft ────────────────────────────────────────────────────────

/** The three top-level prose paths, in the order reframe writes them. */
const TOP_LEVEL_PROSE = ['tagline', 'about', 'story'] as const

/** The offering-blurb ledger path for an index. Matches reframe/apply.ts offeringBlurbPath
 *  exactly, so a path this module returns keys the same ledger entry reframe stamped. PURE. */
function offeringBlurbPath(index: number): string {
  return `offerings[${index}].blurb`
}

/**
 * The prose ledger paths on a draft that scan CLEAN, so the caller may promote their ledger
 * entries to verified. Covers 'tagline' | 'about' | 'story' and each 'offerings[i].blurb'.
 * PURE + total.
 *
 * Absent, empty, and whitespace-only values are SKIPPED (there is nothing to publish, so
 * there is nothing to clear); a value that trips any rule is omitted. Paths come back in
 * draft order: tagline, about, story, then each offering blurb by index.
 */
export function cleanProsePaths(draft: BusinessProfile): string[] {
  const out: string[] = []
  if (!draft) return out

  for (const path of TOP_LEVEL_PROSE) {
    const value = draft[path]
    if (typeof value !== 'string' || !value.trim()) continue
    if (scanProse(value).clean) out.push(path)
  }

  ;(draft.offerings ?? []).forEach((offering, i) => {
    const blurb = offering?.blurb
    if (typeof blurb !== 'string' || !blurb.trim()) return
    if (scanProse(blurb).clean) out.push(offeringBlurbPath(i))
  })

  return out
}
