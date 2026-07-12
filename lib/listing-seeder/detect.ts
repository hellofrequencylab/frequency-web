// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — kind auto-detection (Wave 3 polish). A PURE
// keyword/heuristic scorer over the operator's pasted block, so the start form can
// PRE-SELECT the likely vertical while the operator pastes. No AI, no IO — just a
// weighted vote between Housing and Classifieds signals. The operator always overrides;
// this only nudges, and only when it is confident.
//
// Framework-independent (imported by the client start form + unit-tested directly).
// ─────────────────────────────────────────────────────────────────────────────

import type { ListingSeedKind } from './types'

/** A confident detection needs at least this many winning signals AND this much of a margin
 *  over the other kind. Below either bar, confidence is 'low' and the form does NOT pre-select. */
const MIN_WINNING_HITS = 2
const MIN_MARGIN = 2

/** Signals that a paste is HOUSING copy (a place on offer). Each matches at most once toward the score. */
const HOUSING_SIGNALS: readonly RegExp[] = [
  /\bfor rent\b/i,
  /\brent(?:al|ing)?\b/i,
  /\/\s?mo\b/i,
  /\bper month\b/i,
  /\bbedroom/i,
  /\bbath(?:room|s)?\b/i,
  /\blease\b/i,
  /\b(?:sq\.?\s?ft|sqft|square\s?feet)\b/i,
  /\bdeposit\b/i,
  /\bapartment\b/i,
  /\broommate\b/i,
  /\bsublet\b/i,
  /\bstudio\b/i,
  /\bfurnished\b/i,
  /\butilities\b/i,
  /\bmove[-\s]?in\b/i,
  /\b(?:tenant|landlord)\b/i,
]

/** Signals that a paste is CLASSIFIEDS copy (a thing for sale / free / lend / wanted). */
const CLASSIFIEDS_SIGNALS: readonly RegExp[] = [
  /\bfor sale\b/i,
  /\bo\.?b\.?o\b/i,
  /\bbrand new\b/i,
  /\blike new\b/i,
  /\b(?:gently|barely)\s+used\b/i,
  /\bpick[-\s]?up\b/i,
  /\bcondition\b/i,
  /\bcash only\b/i,
  /\bmust (?:sell|go)\b/i,
  /\bselling\b/i,
  /\bnegotiable\b/i,
  /\bfirm\b/i,
]

/** Count the DISTINCT signals a paste trips (each pattern votes at most once). PURE. */
function score(text: string, signals: readonly RegExp[]): number {
  let hits = 0
  for (const re of signals) if (re.test(text)) hits += 1
  return hits
}

export interface ListingKindDetection {
  /** The detected vertical, or null when the paste is empty, ambiguous, or a tie. */
  kind: ListingSeedKind | null
  /** 'high' only when one kind clearly wins (enough signals AND a clear margin); else 'low'. */
  confidence: 'high' | 'low'
}

/**
 * Detect the likely seeder vertical from a pasted listing block. PURE: a weighted keyword vote
 * between Housing and Classifieds signals. Returns { kind: null, confidence: 'low' } for an empty
 * paste, a tie, or no signal at all. Confidence is 'high' only when the winner clears both the
 * minimum-hits and the margin bar, which is the only case the start form pre-selects on.
 */
export function detectListingKind(pastedText: string): ListingKindDetection {
  const text = (pastedText ?? '').trim()
  if (!text) return { kind: null, confidence: 'low' }

  const housing = score(text, HOUSING_SIGNALS)
  const classifieds = score(text, CLASSIFIEDS_SIGNALS)

  if (housing === classifieds) return { kind: null, confidence: 'low' }

  const kind: ListingSeedKind = housing > classifieds ? 'housing' : 'classifieds'
  const winner = Math.max(housing, classifieds)
  const margin = Math.abs(housing - classifieds)
  const confidence = winner >= MIN_WINNING_HITS && margin >= MIN_MARGIN ? 'high' : 'low'

  return { kind, confidence }
}
