// ── EFFORT RELATIVE TO YOURSELF ─────────────────────────────────────────────────────────────────
//
// The owner's ruling for the Circle board, and the whole of its design: a member is measured
// against THEIR OWN recent baseline, never against the person next to them. A beginner and a
// veteran can both be doing well in the same week, because they are not on the same axis. There is
// no 1-to-N ranking here and there is no "top" to reach.
//
// This is a wellbeing product. The research the repo already cites in components/quest/
// collective-goal.tsx (Festinger 1954, JMIR 2021) is unambiguous: an absolute board rewards the top
// few and demotivates everyone else, and the bottom of a visible ladder churns exactly the people
// who most need to stay. So the number a row shows is a ratio whose denominator is that member's
// own history, the rows are never ordered by it, and nobody is ever told where they placed.
//
// ── THE FORMULA, IN ONE LINE ────────────────────────────────────────────────────────────────────
//
//   effort index = this week's Zaps ÷ your usual week × 100, capped at 200
//   your usual week = the MEDIAN of your last four weeks THAT HAD ANY ACTIVITY
//
// Every term is derived from data that exists. `zap_transactions` (20260607040000_zap_ledger_and_
// recategorize.sql) is an append-only ledger of `profile_id · amount · created_at`, indexed on
// profile and on created_at. That is the only per-member, timestamped record of Quest effort in the
// schema, so it is the only thing a windowed self-comparison can honestly be built on. Nothing here
// needs a migration, a new column, or a nightly job.
//
// ── WHY EACH CHOICE ─────────────────────────────────────────────────────────────────────────────
//
// WHY 7 DAYS FORWARD. A circle lives in weeks: it meets on a night, people practise around it. A
// shorter window is noise (one missed Tuesday halves it); a longer one stops describing "now".
//
// WHY FOUR WEEKS OF BASELINE. Long enough that one unusual week cannot define your normal, short
// enough that it is still recognisably YOU rather than a person you were last season.
//
// WHY THE MEDIAN, NOT THE MEAN. Finishing a Journey pays +75 Zaps in a single week (ADR-305). On a
// mean, that one week inflates the denominator and the next four weeks all read as a decline, which
// would punish a member for having finished something. The median of four shrugs off one outlier.
//
// WHY ONLY THE WEEKS THAT HAD ACTIVITY. A week you were ill is not evidence about your usual week,
// in either direction. Counting a zero week would halve the denominator and hand you a fake 200%
// the week you came back, which is a lie the skeptic test would catch instantly. Dropping it keeps
// the denominator honest, and the `returning` band below is what actually protects the person who
// was away.
//
// WHY A 200% CAP. Above it, every row reads the same, so there is nothing to win by grinding and
// no arms race to lose. It also bounds the absurd: a member whose usual week is 8 Zaps and who
// logs 400 does not get a 5,000% trophy.
//
// WHY A ROW ONLY EXISTS IF YOU SHOWED UP. A member who took the week off is ABSENT from the board,
// not sitting at the bottom of it with a 0%. Absence is the kind answer and the honest one: the
// board is "who showed up this week", not "everyone, ranked".
//
// ── THE COLD START, WHICH IS THE COMMON CASE ────────────────────────────────────────────────────
//
// A self-relative score needs a baseline to exist, and a member in their first week has none. This
// is not an edge: every member of a new circle is in it. So the board never guesses and never
// shows a fabricated comparison. Two named states, each with its own row copy:
//
//   • `new`       — fewer than two active baseline weeks AND the account is younger than the whole
//                   35-day window. There is no usual week yet because there has not been time for
//                   one. The row shows the DAYS they showed up this week, a fact about them that
//                   needs no history, and the chip says so plainly ("No usual week yet").
//   • `returning` — fewer than two active baseline weeks but an older account. They have a history;
//                   the last month was quiet. Same row treatment ("Back this week"). A gap NEVER
//                   costs a member a band: they are routed here before any ratio is computed, so
//                   illness, travel or a hard month cannot show up as a bad number.
//
// The two-week minimum is the rule in one sentence: you need at least two of your last four weeks
// to have had activity before we will compare you with you.
//
// KNOWN AND ACCEPTED: a member whose account is old but who has genuinely never practised before
// this week reads as `returning` rather than `new`. Both are warm, neither shows a ratio, and
// distinguishing them would cost a full-history query per member for a one-word difference.
//
// Pure: no React, no Next, no Supabase, no clock of its own (callers pass `now`). Everything here
// is unit-tested in ./effort.test.ts.

/** How a member's week compares with their own. Never a position, never a tier over anyone else. */
export type EffortBand = 'climbing' | 'steady' | 'easing' | 'returning' | 'new'

/** One credit from `zap_transactions`: when it landed, and how much. */
export interface EffortEntry {
  /** ISO timestamp (`zap_transactions.created_at`). */
  at: string
  /** `zap_transactions.amount`. Non-positive rows (corrections, clawbacks) are ignored. */
  amount: number
}

export interface EffortScore {
  band: EffortBand
  /** Zaps earned in the last 7 days. */
  recent: number
  /** This member's usual week: the median of their active baseline weeks. Null when none exists. */
  baseline: number | null
  /** `recent` as a percent of `baseline`, clamped to [0, EFFORT_INDEX_CAP]. Null with no baseline. */
  index: number | null
  /** Distinct UTC days in the last 7 on which they earned anything. The fact a row with no
   *  baseline shows instead of a comparison it cannot honestly make. */
  daysThisWeek: number
}

const DAY_MS = 86_400_000

/** The window a row describes: "this week". */
export const RECENT_WINDOW_DAYS = 7
/** How many earlier weeks the usual week is drawn from. */
export const BASELINE_WEEKS = 4
/** The whole span the score reads: this week plus the four before it. */
export const WINDOW_DAYS = RECENT_WINDOW_DAYS * (1 + BASELINE_WEEKS)
/** Weeks with activity needed before a member is compared with themselves at all. */
export const MIN_ACTIVE_BASELINE_WEEKS = 2
/** Ceiling on the index, so there is nothing to win by grinding. */
export const EFFORT_INDEX_CAP = 200
/** At or above this, the week reads as above their usual. */
export const CLIMBING_AT = 125
/** Below this, the week reads as a lighter one. Never as a deficit, never as a position. */
export const EASING_BELOW = 75

/**
 * How many people have to have shown up in the same week before a list of them is a board.
 *
 * Under this, a "board" is three names in a column, and a column of three IS a ranking however it
 * is dressed: everyone can see who is where. Production's largest circle holds two members and five
 * posts, so this state is the COMMON one, not a fallback — the surface below the threshold is the
 * shared bar plus an honest empty state, which is a complete answer, not a degraded one.
 */
export const MIN_BOARD_CONTRIBUTORS = 6

/** Median of a non-empty list of numbers (even lengths average the middle pair). */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Which 7-day bucket a timestamp falls in: 0 = this week, 1..BASELINE_WEEKS = the weeks before it,
 * -1 = outside the window (or unparseable). A future timestamp counts as this week rather than
 * being thrown away, so clock skew can never silently delete someone's effort.
 */
export function weekBucket(now: number, at: string): number {
  const ms = Date.parse(at)
  if (!Number.isFinite(ms)) return -1
  const days = Math.floor((now - ms) / DAY_MS)
  if (days < 0) return 0
  if (days >= WINDOW_DAYS) return -1
  return Math.floor(days / RECENT_WINDOW_DAYS)
}

/**
 * Score one member's effort against their own recent baseline.
 *
 * `accountAgeDays` separates the two no-baseline states (see the header): younger than the whole
 * window means there has not been TIME for a usual week; older means there was time and the last
 * month was quiet. Both skip the ratio entirely.
 */
export function scoreEffort({
  entries,
  accountAgeDays,
  now = Date.now(),
}: {
  entries: EffortEntry[]
  /** How long this member has had an account, in days. */
  accountAgeDays: number
  /** Injected so every test is deterministic and no caller depends on a hidden clock. */
  now?: number
}): EffortScore {
  const weeks = new Array<number>(1 + BASELINE_WEEKS).fill(0)
  const days = new Set<string>()

  for (const entry of entries) {
    const amount = Number(entry?.amount)
    // Ledger corrections are real rows with negative amounts. They are not effort, and letting them
    // net a week downward would let a refund read as a lighter week.
    if (!Number.isFinite(amount) || amount <= 0) continue
    const bucket = weekBucket(now, entry.at)
    if (bucket < 0) continue
    weeks[bucket] += amount
    if (bucket === 0) days.add(entry.at.slice(0, 10))
  }

  const recent = weeks[0]
  const daysThisWeek = days.size
  const activeBaselineWeeks = weeks.slice(1).filter((total) => total > 0)

  if (activeBaselineWeeks.length < MIN_ACTIVE_BASELINE_WEEKS) {
    const band: EffortBand = accountAgeDays < WINDOW_DAYS ? 'new' : 'returning'
    return { band, recent, baseline: null, index: null, daysThisWeek }
  }

  const baseline = median(activeBaselineWeeks)
  const raw = Math.round((recent / baseline) * 100)
  const index = Math.max(0, Math.min(EFFORT_INDEX_CAP, raw))
  const band: EffortBand = index >= CLIMBING_AT ? 'climbing' : index >= EASING_BELOW ? 'steady' : 'easing'

  return { band, recent, baseline, index, daysThisWeek }
}

// ── THE BOARD ITSELF ────────────────────────────────────────────────────────────────────────────

/** One member, already scored, as the board composer takes them. */
export interface EffortCandidate {
  id: string
  displayName: string
  /** `profiles.meta.leaderboardOptOut`. Hides the ROW; never touches the shared total. */
  optedOut: boolean
  effort: EffortScore
}

export interface EffortBoard<T extends EffortCandidate> {
  /** The rows to render: showed up this week, not opted out, ALPHABETICAL. Empty below the gate. */
  rows: T[]
  /** How many visible people showed up this week. The gate reads this, not the roster size. */
  showing: number
  /** False below MIN_BOARD_CONTRIBUTORS: render the shared bar and an empty state instead. */
  showsBoard: boolean
}

/**
 * Build the board from scored candidates.
 *
 * THREE RULES, and they are the whole board:
 *
 *  1. A row exists only if the member showed up this week. Nobody sits at the bottom with a zero.
 *  2. An opted-out member has no row. They still count toward the shared total, because the total
 *     is read from the circle's own activity and never from this list (the promise made in
 *     app/(main)/crew/leaderboard/opt-out.ts, kept here).
 *  3. THE ORDER IS ALPHABETICAL, and that is load-bearing. Sorting by the index would rebuild the
 *     ladder the owner rejected, one row at a time. Alphabetical is the visible proof that the
 *     numbers are not comparable across rows: they have different denominators.
 *
 * Below the contributor gate the rows are dropped entirely rather than shown short, so no caller
 * can accidentally render a ladder of three by ignoring `showsBoard`.
 */
export function buildEffortBoard<T extends EffortCandidate>(candidates: T[]): EffortBoard<T> {
  const visible = candidates
    .filter((c) => !c.optedOut)
    .filter((c) => c.effort.recent > 0 || c.effort.daysThisWeek > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))

  const showsBoard = visible.length >= MIN_BOARD_CONTRIBUTORS
  return { rows: showsBoard ? visible : [], showing: visible.length, showsBoard }
}
