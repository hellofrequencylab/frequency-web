// A poll's view and the one rule for how a vote moves it (LIVE-682). PURE and client-safe: the
// poll block applies it optimistically, and the tally trigger (migration 20270346002400) is the
// same rule on the server: one vote per member, a new pick moves it, the same pick takes it back.

export interface PollView {
  options: { id: string; label: string; votes: number }[]
  total: number
  /** The option the viewer picked, or null. */
  myOptionId: string | null
}

/** The poll after the viewer taps `optionId`. PURE. */
export function applyVote(poll: PollView, optionId: string): PollView {
  if (!poll.options.some((o) => o.id === optionId)) return poll
  const before = poll.myOptionId
  const after = before === optionId ? null : optionId
  const options = poll.options.map((o) => {
    let votes = o.votes
    if (o.id === before) votes = Math.max(0, votes - 1)
    if (o.id === after) votes += 1
    return { ...o, votes }
  })
  return { options, total: options.reduce((n, o) => n + o.votes, 0), myOptionId: after }
}

/** Whole-number share of the vote, 0 when nobody has voted. PURE. */
export function votePercent(votes: number, total: number): number {
  return total > 0 ? Math.round((votes / total) * 100) : 0
}
