// ── SPACE STANDING: the earned-exposure score behind the Space directory (LIVE-262 / LIVE-263) ────
//
// docs/CORE-MODEL.md Phase 10 ("Placement is earned"). The directory used to order by
// `.order('name')`, so the most valuable exposure surface a business has rewarded nothing except
// starting with the letter A. This module is the ordering that replaces it.
//
// 🔴 THE ONE INVARIANT, AND IT IS THE WHOLE POINT: **exposure is earned, never sold.** No plan,
// tier, entitlement, seat count, Stripe field, founding status or any other commercial term enters
// this file, and none may ever be added. Every signal below is a thing a Space DID: it gathered
// people, it kept a room open, someone chose to follow it, someone joined it, the operator filled
// in the page. A Space on the free wedge and a Space on the top plan are scored by exactly the same
// six numbers. `lib/spaces/standing.test.ts` pins that with a source-shape guard, so a paid signal
// cannot be added here without a red test.
//
// PURE — no IO, no Supabase/Next imports, no clock — so the SAME formula serves both feeders:
//   · v0 (LIVE-262): the directory read scores live, from the counts it already fetches per page.
//   · v1 (LIVE-263): the nightly rollup scores the whole population into `space_standing`.
// One definition, two callers, no drift.
//
// ── The shape, borrowed from what this repo already does ─────────────────────────────────────────
//
//   · `saturate(n)` is `lib/resonance/score.ts`'s diminishing-returns curve, `1 - e^-n`, with a
//     per-signal SCALE so the curve reaches over the range each count actually lives in. The raw
//     resonance curve reads 1 shared circle as 0.63; one follower is not a saturated audience, so
//     `saturate(n / scale)` is the same function with the units named.
//   · RENORMALISATION OVER PRESENT SIGNALS is `lib/feed/blend-rank.ts`: a signal that is absent is
//     dropped and its weight redistributed, never scored as a zero.
//   · The HARMONIC MEAN is `lib/resonance/score.ts` again: it is dragged toward the smaller of its
//     two inputs, so a one-sided Space cannot top the directory.
//
// ── ⚠️ WHAT "PRESENT" MEANS, because getting this backwards inverts the ranking ──────────────────
//
// A signal is PRESENT when THE READER COULD MEASURE IT, not when the Space has a non-zero amount of
// it. A Space with zero followers has an audience signal worth 0. A Space whose follower count was
// never fetched has NO audience signal, and its weight goes to the signals that were.
//
// That distinction is what makes renormalisation safe. Read the other way — "zero means absent" —
// it would reward emptiness: a Space with one follower and nothing else would score 0.63 on its
// single present signal and beat a Space doing five things moderately well. Read this way, every
// Space inside one ranking pass is scored on the SAME signal set (the reader fetched the same
// columns for all of them), so renormalisation never advantages one Space over another. It exists
// for one job only: to let the score exist before every signal does.
//
// Which is exactly how the ATTENDANCE GAP is handled, honestly and in the open:
//
// 🔴 **ATTENDANCE IS NOT IN THIS SCORE, AND IT IS NOT A ZERO EITHER.** Whether anyone actually
// turned up to a gathering has NO independent record on this platform: there is no `checked_in`
// column, and the only trace is an engagement-ledger row written by the path that pays Zaps, which
// means "attended" and "was paid for attending" are the same fact and neither can be read for a
// Space that does not run Zaps. Weighting it would be inventing data. So it is simply not declared
// as a signal: `gatherings` counts gatherings HELD (a published, non-cancelled gathering whose
// start time has passed), which is a claim we can actually stand behind. The day an independent
// attendance record exists, it is added as a seventh signal and every Space is re-scored against
// it at once; no weight below needs to change, because they renormalise.
//
// ── THE SIX SIGNALS, one line each, and why none of them can be bought ───────────────────────────
//
//   gatherings — gatherings this Space actually HELD in the trailing window. Earned by hosting;
//                money cannot make a date pass with a published gathering on it.
//   upcoming   — gatherings on the calendar ahead. Earned by planning the next one.
//   rooms      — listed, joinable Circles the Space keeps open. Earned by tending a standing place.
//   audience   — members who chose to follow it. Earned; a follow is another person's decision.
//   commons    — active members of the Space. Earned; joining is a member's own act.
//   care       — how much of the public page the operator actually filled in. Earned by doing the
//                work, and it is the one signal whose "what would send more" answer is immediate.
//
// None is purchasable, and none is a proxy for a purchase: a paid Space and a free Space run the
// same gathering, keep the same room, and are followed by the same people.

/** The six signals a standing score is composed from. */
export type StandingSignal = 'gatherings' | 'upcoming' | 'rooms' | 'audience' | 'commons' | 'care'

export const STANDING_SIGNALS: readonly StandingSignal[] = [
  'gatherings',
  'upcoming',
  'rooms',
  'audience',
  'commons',
  'care',
] as const

/**
 * The two halves the harmonic mean joins. DOING is what the Space puts into the world; BELONGING is
 * what the world put back. A Space that gathers constantly for nobody, and a Space with a following
 * that never opens its doors, are both one-sided, and the harmonic mean says so.
 */
export const DOING_SIGNALS: readonly StandingSignal[] = ['gatherings', 'upcoming', 'rooms'] as const
export const BELONGING_SIGNALS: readonly StandingSignal[] = ['audience', 'commons', 'care'] as const

/** Relative weight of each signal INSIDE its half. Renormalised over whichever are present, so
 *  these are ratios, not budgets; they do not need to be re-tuned when a signal is added. */
export const STANDING_WEIGHTS: Record<StandingSignal, number> = {
  // DOING — a gathering that happened is the hardest thing on this list to fake, so it leads.
  gatherings: 0.45,
  upcoming: 0.3,
  rooms: 0.25,
  // BELONGING — joining is a bigger act than following, and both outrank a filled-in page.
  commons: 0.4,
  audience: 0.35,
  care: 0.25,
}

/**
 * The count at which each signal reads as ~0.63 (one "unit" on the saturation curve). Tuned to the
 * range each count actually lives in on this platform, measured 2026-09-08 across 20 networked
 * Spaces: 8 have any published event, 4 have an upcoming one, 1 has a circle, 7 have a follower,
 * and 0 have a paid membership. Without these the curve would saturate on the first row and the
 * sort would degenerate into "has at least one of anything".
 *
 * `care` has no scale: it arrives as a fraction in [0, 1], not a count.
 */
export const STANDING_SCALES: Record<Exclude<StandingSignal, 'care'>, number> = {
  gatherings: 4,
  upcoming: 2,
  rooms: 2,
  audience: 10,
  commons: 8,
}

/**
 * The floor each half is lifted to before the harmonic mean. Mirrors the 0.3 propensity floor in
 * `lib/resonance/score.ts` and exists for the same reason: an exact zero on one side would collapse
 * the harmonic mean to a hard 0 and flatten every Space that has not run a gathering yet into one
 * untied heap, which is the alphabetical problem again wearing a different hat. With the floor, a
 * one-sided Space is heavily discounted but still ORDERED by the half it does have.
 */
export const HALF_FLOOR = 0.15

/**
 * The raw, per-Space inputs. Every field is `number | null | undefined`, and the three states are
 * meaningfully different:
 *   · a number  — measured, this is the amount (0 is a real measurement).
 *   · `null` / `undefined` — NOT MEASURED by this reader. The signal is dropped and its weight
 *     redistributed; the Space is not scored down for it.
 * `care` is the odd one out: it is already a fraction in [0, 1] (see `careScore`), not a count.
 */
export interface StandingInput {
  /** Gatherings HELD (published, not cancelled, already started) in the trailing window. */
  gatherings?: number | null
  /** Published, non-cancelled gatherings still ahead. */
  upcoming?: number | null
  /** Listed, joinable Circles this Space runs. */
  rooms?: number | null
  /** Members who follow this Space. */
  audience?: number | null
  /** Active members of this Space. */
  commons?: number | null
  /** Public-page completeness as a fraction in [0, 1] (see `careScore`). */
  care?: number | null
}

/** One half of the score: its value in [0, 1] and which signals it was built from. */
export interface StandingHalf {
  /** The renormalised weighted mean over the present signals, or null when none were measured. */
  value: number | null
  present: StandingSignal[]
}

/** A resolved standing score, with enough detail for the operator receipt page to explain it. */
export interface StandingResult {
  /** The final score in [0, 1]. Higher = better standing. */
  score: number
  /** Each signal's SATURATED value in [0, 1], or null when it was not measured. */
  signals: Record<StandingSignal, number | null>
  /** Every signal that was measured, in declaration order. */
  present: StandingSignal[]
  /** What this Space puts into the world (gatherings, upcoming, rooms). */
  doing: StandingHalf
  /** What the world put back (audience, commons, care). */
  belonging: StandingHalf
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * Diminishing returns on a count, `1 - e^-(n/scale)`. The same curve as `lib/resonance/score.ts`
 * with the unit named: at `n === scale` it reads ~0.63, at `2 x scale` ~0.86, and it never reaches
 * 1, so a Space with a hundred followers cannot buy its way past a Space with ten by volume alone.
 * PURE. A non-finite or negative count reads as 0.
 */
export function saturate(count: number, scale = 1): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  return 1 - Math.exp(-count / s)
}

/**
 * The harmonic mean of two non-negative numbers, 0 when either is 0. PURE. Copied in spirit from
 * `lib/resonance/score.ts`: it is dragged toward the SMALLER input, so `harmonicMean(0.9, 0.15)`
 * is ~0.26, not 0.53. That is the whole reason the two halves are joined this way.
 */
export function harmonicMean(x: number, y: number): number {
  const a = Math.max(0, x)
  const b = Math.max(0, y)
  if (a === 0 || b === 0) return 0
  return (2 * a * b) / (a + b)
}

/** Is this input a MEASUREMENT (a finite number), rather than "not measured"? PURE. */
function measured(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** One signal's saturated value in [0, 1], or null when it was not measured. PURE. */
function signalValue(signal: StandingSignal, input: StandingInput): number | null {
  const raw = input[signal]
  if (!measured(raw)) return null
  // `care` arrives as a fraction, so it is clamped rather than saturated.
  if (signal === 'care') return clamp01(raw)
  return saturate(raw, STANDING_SCALES[signal])
}

/** Renormalised weighted mean over whichever of `signals` were measured. PURE. */
function half(signals: readonly StandingSignal[], values: Record<StandingSignal, number | null>): StandingHalf {
  const present: StandingSignal[] = []
  let num = 0
  let den = 0
  for (const s of signals) {
    const v = values[s]
    if (v === null) continue
    present.push(s)
    num += STANDING_WEIGHTS[s] * v
    den += STANDING_WEIGHTS[s]
  }
  return { value: den > 0 ? clamp01(num / den) : null, present }
}

/** Lift a half off the floor so a zero side discounts rather than annihilates. PURE. */
function floored(value: number): number {
  return HALF_FLOOR + (1 - HALF_FLOOR) * clamp01(value)
}

/**
 * The standing score for one Space, in [0, 1]. PURE + deterministic.
 *
 * · Each measured signal saturates into [0, 1] on its own scale.
 * · Each half is the weighted mean over the signals THAT HALF actually measured (renormalised).
 * · When both halves were measured, the score is the harmonic mean of the two, each lifted off
 *   `HALF_FLOOR`: a Space that only does, or only belongs, is discounted toward the floor but stays
 *   ordered by the half it has.
 * · When only ONE half was measured, that half IS the score (no floor, nothing to punish it with).
 * · When neither was measured, the score is 0 and the caller falls back to its own tie-break.
 *
 * Nothing here reads a plan, a tier, an entitlement, or a payment.
 */
export function standingScore(input: StandingInput): StandingResult {
  const signals = {
    gatherings: signalValue('gatherings', input),
    upcoming: signalValue('upcoming', input),
    rooms: signalValue('rooms', input),
    audience: signalValue('audience', input),
    commons: signalValue('commons', input),
    care: signalValue('care', input),
  } satisfies Record<StandingSignal, number | null>

  const doing = half(DOING_SIGNALS, signals)
  const belonging = half(BELONGING_SIGNALS, signals)

  let score: number
  if (doing.value !== null && belonging.value !== null) {
    score = harmonicMean(floored(doing.value), floored(belonging.value))
  } else if (doing.value !== null) {
    score = doing.value
  } else if (belonging.value !== null) {
    score = belonging.value
  } else {
    score = 0
  }

  return {
    score: clamp01(score),
    signals,
    present: STANDING_SIGNALS.filter((s) => signals[s] !== null),
    doing,
    belonging,
  }
}

// ── care: the one signal the operator moves on their own, today ──────────────────────────────────

/**
 * The fields that make up `care`. Every one is OPTIONAL in the "was it measured" sense: a field the
 * reader did not fetch is left `undefined` and drops out of the denominator, exactly like a whole
 * signal does. A field that WAS fetched and is empty (`null`, `''`, `0`) counts against the score,
 * because that is the honest reading: the operator could fill it and has not.
 */
export interface CareInput {
  /** spaces.tagline — the one-line positioning every card and search result shows. */
  tagline?: string | null
  /** spaces.brand_logo_url. */
  logoUrl?: string | null
  /** spaces.cover_image_url — the image that leads the card. */
  coverUrl?: string | null
  /** preferences.profileData.subject — which of the shared subject doors this Space is behind. */
  subject?: string | null
  /** preferences.profileData.about — the story. */
  about?: string | null
  /** How many services / offerings are listed (preferences.profileData.offerings). */
  offerings?: number | null
  /** How many social / business-presence links are listed (preferences.profileData.socials). */
  socials?: number | null
}

/** True when a string field is filled (non-blank). PURE. */
function filled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Public-page care as a fraction in [0, 1]: the share of the fields the reader looked at that the
 * operator has actually filled in. PURE. Returns null when NOTHING was measured, so the caller can
 * pass it straight through as "signal absent".
 *
 * This deliberately mirrors what `lib/spaces/completeness.ts` shows an operator in their own
 * console, so the thing the console tells them to fix is the same thing that moves their standing.
 * It is not a copy of that scorer: this one takes only the fields a directory row already carries,
 * and it never punishes a reader for not fetching a field.
 */
export function careScore(input: CareInput): number | null {
  const checks: (boolean | null)[] = [
    input.tagline === undefined ? null : filled(input.tagline),
    input.logoUrl === undefined ? null : filled(input.logoUrl),
    input.coverUrl === undefined ? null : filled(input.coverUrl),
    input.subject === undefined ? null : filled(input.subject),
    input.about === undefined ? null : filled(input.about),
    input.offerings === undefined ? null : measured(input.offerings) && input.offerings > 0,
    input.socials === undefined ? null : measured(input.socials) && input.socials > 0,
  ]
  const looked = checks.filter((c): c is boolean => c !== null)
  if (looked.length === 0) return null
  return looked.filter(Boolean).length / looked.length
}

// ── The operator-facing explanation (LIVE-265: "what would send more") ───────────────────────────

/** How a signal is doing, in the plain terms the receipt page prints. */
export type StandingBand = 'strong' | 'building' | 'quiet' | 'unmeasured'

/** One line on the receipt: what the signal is, where this Space stands, and the next move. */
export interface StandingLever {
  signal: StandingSignal
  /** The member-facing name of the signal (NAMING.md terms: gatherings, Circles, Spaces). */
  label: string
  /** What it measures, in one plain line. */
  measures: string
  /** The single next thing that moves it. */
  move: string
  band: StandingBand
  /** The saturated value in [0, 1], or null when the signal was not measured. */
  value: number | null
}

/** What each signal measures and the one move that raises it. Voice canon: plain sentences, no em
 *  dashes, no narrating the reader's feelings, no promises about outcomes. */
const LEVER_COPY: Record<StandingSignal, { label: string; measures: string; move: string }> = {
  gatherings: {
    label: 'Gatherings held',
    measures: 'Gatherings you have actually run, counted after they happen.',
    move: 'Run one gathering and let it happen. Held counts more than planned.',
  },
  upcoming: {
    label: 'On the calendar',
    measures: 'Published gatherings still ahead of you.',
    move: 'Put the next date up, even a small one.',
  },
  rooms: {
    label: 'Circles open',
    measures: 'Listed Circles people can join and stay in.',
    move: 'Open one Circle so people have somewhere to land between gatherings.',
  },
  audience: {
    label: 'Followers',
    measures: 'Members who chose to follow your Space.',
    move: 'Share your Space page. A follow is someone asking to hear from you.',
  },
  commons: {
    label: 'Members',
    measures: 'People who have joined your Space.',
    move: 'Invite the people who already come to you.',
  },
  care: {
    label: 'Your page',
    measures: 'How much of your public page you have filled in.',
    move: 'Add the missing pieces: tagline, logo, cover, subject, story, services, links.',
  },
}

/** Which band a saturated value falls in. PURE. */
function bandFor(value: number | null): StandingBand {
  if (value === null) return 'unmeasured'
  if (value >= 0.6) return 'strong'
  if (value > 0) return 'building'
  return 'quiet'
}

/**
 * The receipt's lever list: every signal, what it measures, where this Space stands, and the one
 * move that raises it. Ordered weakest-measured first, so the top of the list is the next thing
 * worth doing rather than a victory lap. Unmeasured signals sink to the bottom (there is nothing
 * the operator can do about a signal nobody is reading yet). PURE.
 */
export function standingLevers(result: StandingResult): StandingLever[] {
  return STANDING_SIGNALS.map((signal) => ({
    signal,
    ...LEVER_COPY[signal],
    band: bandFor(result.signals[signal]),
    value: result.signals[signal],
  })).sort((a, b) => {
    if (a.value === null && b.value === null) return 0
    if (a.value === null) return 1
    if (b.value === null) return -1
    return a.value - b.value
  })
}
