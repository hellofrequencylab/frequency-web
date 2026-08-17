// The a11y ratchet's JUDGEMENT, extracted so it can be tested without a browser.
//
// ── The distinction this file exists to make ──────────────────────────────────
// A number in `a11y-baselines.json` can mean one of two different things, and until
// 2026-08-17 the gate could not tell them apart because it compared every one of them with
// `total <= allowed`:
//
//   READING — "the measured value on this surface IS N." Both directions are wrong: N+1 is a
//             regression, and N-1 means the file no longer describes the product. So a reading
//             is asserted with EQUALITY, and an improvement fails just as loudly as a
//             regression, which is what forces the win to be written down.
//
//   CEILING — "this surface may carry up to N, and I do not know the real number." That is a
//             strictly weaker claim, and it is the right one in exactly one situation: nobody
//             has measured the surface honestly yet. It is weaker because every unit of
//             headroom under a ceiling is a place a real regression can sit while CI prints a
//             tick — which is how /feed, /settings and /spaces/<slug>/manage came to hold 12, 7
//             and 8 as raw pre-waiver seeds whose true residual was believed to be 0-3.
//
// A ceiling is therefore an EXCEPTION with paperwork, not the default. `resolveBaseline` treats
// a bare number as a reading; only an explicit object — carrying `why`, `retiredBy` and the
// same `frozen`/`history` provenance `scripts/adoption-baselines.json` demands — buys the
// weaker comparison. `scripts/check-a11y-baselines.mjs` enforces that paperwork statically, so
// a ceiling cannot be raised, or invented, without a written reason in the same diff.
//
// Nothing here reads the filesystem, imports Playwright, or knows what axe is: the spec passes
// in a total and a parsed document. That is what lets `a11y-ratchet.test.ts` prove the gate
// fires in BOTH directions on a runner with no browser at all.

/** How a ceiling came to hold its value. Mirrors `DIRECTIONS` in scripts/check-adoption.mjs. */
export const DIRECTIONS = ['seed', 'lowered', 'raised'] as const
export type Direction = (typeof DIRECTIONS)[number]

/** One entry in a ceiling's provenance chain. `from` is null only for the first (`seed`). */
export interface Change {
  at: string
  value: number
  from: number | null
  direction: Direction
  reason: string
}

/** A declared ceiling: the weaker comparison, and the paperwork that pays for it. */
export interface CeilingEntry {
  /** The number `total` is allowed to reach. */
  ceiling: number
  /** Why this is not a reading — i.e. what is missing before it can become one. */
  why: string
  /** The command that replaces this ceiling with a reading. A ceiling with no exit is a hole. */
  retiredBy: string
  /** Provenance of the current value. `frozen.value` must equal `ceiling` (hand-edit guard). */
  frozen: Change
  /** Every value this entry has ever held, oldest first. `history.at(-1)` must equal `frozen`. */
  history: Change[]
}

export interface A11yBaselinesDoc {
  $defaultMax?: number
  surfaces?: Record<string, number | CeilingEntry>
}

export type Baseline =
  | { kind: 'reading'; value: number }
  | { kind: 'ceiling'; value: number; why: string; retiredBy: string }

/** True for the object form. The ONE place ceiling-ness is decided; the static gate imports
 *  this same function rather than re-deciding, and `a11y-ratchet.test.ts` pins the parity. */
export function isCeilingEntry(value: unknown): value is CeilingEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'ceiling' in value
}

/**
 * What this (surface, state, project) context is held to.
 *
 * A context with no entry falls to `$defaultMax` (0) as a READING, not a ceiling: a surface
 * nobody has frozen must be exactly clean, which is the rule the file has always claimed and
 * the merge script now enforces on new contexts too.
 */
export function resolveBaseline(doc: A11yBaselinesDoc, context: string): Baseline {
  const entry = doc.surfaces?.[context]
  if (isCeilingEntry(entry)) {
    return { kind: 'ceiling', value: entry.ceiling, why: entry.why, retiredBy: entry.retiredBy }
  }
  if (typeof entry === 'number') return { kind: 'reading', value: entry }
  return { kind: 'reading', value: doc.$defaultMax ?? 0 }
}

export type Verdict =
  /** The measurement matches what is recorded. Nothing to do. */
  | 'held'
  /** More serious+ elements than allowed. Always a failure, under either instrument. */
  | 'regressed'
  /** Fewer than a CEILING allows — permitted, and reported so the ceiling gets retired. */
  | 'improved'
  /** Fewer than a READING records — a failure, because the file has stopped being true. */
  | 'improved-unrecorded'

export interface Judgement {
  ok: boolean
  verdict: Verdict
  /** The recorded number this total was compared against. */
  allowed: number
  kind: Baseline['kind']
}

/**
 * Compare a measured total against its baseline.
 *
 * The asymmetry is the whole point: under a ceiling a fall is news, under a reading a fall is a
 * FAILURE. Both instruments fail on a rise; only the reading also fails on a fall, and that is
 * the property that stops a stale number from sitting in the file describing a product that
 * moved on. Re-recording is one command, so the cost of failing on good news is a re-run.
 */
export function judge(total: number, baseline: Baseline): Judgement {
  const { kind, value } = baseline
  if (total > value) return { ok: false, verdict: 'regressed', allowed: value, kind }
  if (total === value) return { ok: true, verdict: 'held', allowed: value, kind }
  return kind === 'ceiling'
    ? { ok: true, verdict: 'improved', allowed: value, kind }
    : { ok: false, verdict: 'improved-unrecorded', allowed: value, kind }
}

/** The one command that turns any verdict back into a recorded truth. Printed by both the
 *  runtime gate and the static one so a failure never leaves the reader guessing. */
export const RECAPTURE = 'PW_A11Y_UPDATE=1 pnpm test:e2e:a11y && pnpm a11y:baselines'
