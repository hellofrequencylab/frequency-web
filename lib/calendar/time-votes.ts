// FIND A TIME, the pure half (LIVE-2531). A Plan's candidate dates are its live Pencil rows; each
// person answers each one Yes, If need be, or No (public.space_calendar_time_votes). This file reads
// a vote form, tallies the answers and ranks the candidates so the best one shows first.
// No React, no Supabase: the IO half is lib/calendar/time-votes-store.ts.
//
// THE RANK, the way Doodle, When2meet and Calendly polls settle it:
//   1. most Yes,
//   2. then most Yes + If need be (how many CAN come at all),
//   3. then fewest No,
//   4. then the people who must be there: an option a required person said No to sinks below every
//      option they did not, whatever the counts say,
//   5. then the earlier date, so a tie reads in calendar order.
// The first option is "best" only when somebody has voted on it at all; with no votes nothing is
// called best, because a blank poll recommending its first date would be a guess dressed as a result.

export const TIME_VOTE_CHOICES = ['yes', 'maybe', 'no'] as const
export type TimeVoteChoice = (typeof TIME_VOTE_CHOICES)[number]

/** The word a person sees for each answer. "If need be" is Doodle's name for the middle answer. */
export const TIME_VOTE_WORDS: Record<TimeVoteChoice, string> = {
  yes: 'Yes',
  maybe: 'If need be',
  no: 'No',
}

export function isTimeVoteChoice(v: unknown): v is TimeVoteChoice {
  return typeof v === 'string' && (TIME_VOTE_CHOICES as readonly string[]).includes(v)
}

/** One vote row as the app reads it. Exactly one of the two voter keys is set. */
export interface TimeVoteRow {
  entry_id: string
  voter_profile_id: string | null
  voter_email: string | null
  voter_name: string | null
  choice: TimeVoteChoice
}

/** One candidate date, as the ranker needs it. */
interface TimeOptionInput {
  entryId: string
  /** The wall-clock start the calendar stores (ISO), used only to break a tie in date order. */
  startsAt: string
  /** "Sat, Dec 6 · 7:00 PM". */
  whenLabel: string
}

/** The stable key of a voter, whichever kind they are. */
export function voterKey(v: Pick<TimeVoteRow, 'voter_profile_id' | 'voter_email'>): string {
  return v.voter_profile_id ? `p:${v.voter_profile_id}` : `e:${(v.voter_email ?? '').toLowerCase()}`
}

export interface TimeOptionTally {
  entryId: string
  whenLabel: string
  startsAt: string
  yes: number
  maybe: number
  no: number
  /** How many people answered this option at all. */
  answered: number
  /** The names of the people who said each answer, for the hover and the email. */
  names: Record<TimeVoteChoice, string[]>
  /** True when a person who must be there said No to this option. */
  requiredNo: boolean
  /** The caller's own answer on this option, when they gave one. */
  mine: TimeVoteChoice | null
  /** Rank 1 is first. */
  rank: number
  /** The top option once anyone has voted on it. */
  best: boolean
}

/**
 * Tally the votes and rank the options, best first.
 *
 * `required` holds voter keys (see voterKey) of the people who must be there; their No sinks an
 * option. `me` is the caller's voter key, so each option can say what the caller already answered.
 */
export function rankTimeOptions(
  options: readonly TimeOptionInput[],
  votes: readonly TimeVoteRow[],
  opts: { required?: readonly string[]; me?: string | null; nameOf?: (v: TimeVoteRow) => string } = {},
): TimeOptionTally[] {
  const required = new Set(opts.required ?? [])
  const nameOf = opts.nameOf ?? ((v: TimeVoteRow) => v.voter_name ?? v.voter_email ?? 'Someone')
  const ids = new Set(options.map((o) => o.entryId))

  // The last answer a voter gave on an option wins, should a caller hand in duplicates.
  const latest = new Map<string, TimeVoteRow>()
  for (const v of votes) {
    if (!ids.has(v.entry_id) || !isTimeVoteChoice(v.choice)) continue
    latest.set(`${v.entry_id}|${voterKey(v)}`, v)
  }

  const tallies: TimeOptionTally[] = options.map((o) => ({
    entryId: o.entryId,
    whenLabel: o.whenLabel,
    startsAt: o.startsAt,
    yes: 0,
    maybe: 0,
    no: 0,
    answered: 0,
    names: { yes: [], maybe: [], no: [] },
    requiredNo: false,
    mine: null,
    rank: 0,
    best: false,
  }))
  const byId = new Map(tallies.map((t) => [t.entryId, t]))
  for (const v of latest.values()) {
    const t = byId.get(v.entry_id)
    if (!t) continue
    const key = voterKey(v)
    t[v.choice] += 1
    t.answered += 1
    t.names[v.choice].push(nameOf(v))
    if (v.choice === 'no' && required.has(key)) t.requiredNo = true
    if (opts.me && key === opts.me) t.mine = v.choice
  }

  const ranked = [...tallies].sort(
    (a, b) =>
      Number(a.requiredNo) - Number(b.requiredNo) ||
      b.yes - a.yes ||
      b.yes + b.maybe - (a.yes + a.maybe) ||
      a.no - b.no ||
      a.startsAt.localeCompare(b.startsAt),
  )
  ranked.forEach((t, i) => {
    t.rank = i + 1
  })
  if (ranked[0] && ranked[0].answered > 0 && ranked[0].yes + ranked[0].maybe > 0) ranked[0].best = true
  return ranked
}

/** "3 yes · 1 if need be · 1 no", or "No answers yet". */
export function tallyLine(t: Pick<TimeOptionTally, 'yes' | 'maybe' | 'no'>): string {
  const parts: string[] = []
  if (t.yes) parts.push(`${t.yes} yes`)
  if (t.maybe) parts.push(`${t.maybe} if need be`)
  if (t.no) parts.push(`${t.no} no`)
  return parts.length ? parts.join(' · ') : 'No answers yet'
}

/** How many different people have answered any option. */
export function countVoters(votes: readonly TimeVoteRow[]): number {
  return new Set(votes.map(voterKey)).size
}

/** The one line the Plan's owner gets when someone answers: "Dana answered Find a time on Spring
 *  Market: yes to Sat, Dec 6." Plain words, no exclamation, the house voice. */
export function timeVoteNoticeLine(voterName: string, planTitle: string, choice: TimeVoteChoice, whenLabel: string): string {
  const word = choice === 'maybe' ? 'if need be' : choice
  return `${voterName} answered Find a time on ${planTitle}: ${word} to ${whenLabel}.`
}

/** Reads a vote the browser sent. */
export function parseTimeVote(raw: unknown): { entryId: string; choice: TimeVoteChoice | null } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'There was no answer to save.' }
  const r = raw as Record<string, unknown>
  const entryId = typeof r.entryId === 'string' ? r.entryId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryId)) return { error: 'That date is no longer an option.' }
  // null takes the answer back.
  if (r.choice === null) return { entryId, choice: null }
  if (!isTimeVoteChoice(r.choice)) return { error: 'Answer Yes, If need be or No.' }
  return { entryId, choice: r.choice }
}
