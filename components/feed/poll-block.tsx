'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { votePoll } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'
import { applyVote, votePercent, type PollView } from '@/lib/feed/poll-tally'

// A poll's options under its question (LIVE-682). A tap votes, a second tap on the same option takes
// it back, another option moves the vote. The tally moves at once and settles on the server's answer;
// a failed vote puts the poll back and says so. Results show once the viewer has voted, so the count
// does not steer the pick.
export function PollBlock({ postId, poll: initial, canVote }: { postId: string; poll: PollView; canVote: boolean }) {
  const [poll, setPoll] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const showResults = poll.myOptionId !== null || !canVote

  function vote(optionId: string) {
    if (!canVote || isPending) return
    const before = poll
    setPoll(applyVote(poll, optionId))
    setError(null)
    startTransition(async () => {
      const res = await votePoll(postId, optionId)
      if (isError(res)) {
        setPoll(before)
        setError(res.error)
      }
    })
  }

  return (
    <div role="group" aria-label="Poll" className="mb-2.5 space-y-2">
      {poll.options.map((o) => {
        const mine = poll.myOptionId === o.id
        const pct = votePercent(o.votes, poll.total)
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => vote(o.id)}
            disabled={!canVote || isPending}
            aria-pressed={mine}
            className={`relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-control border px-3 py-2 text-left text-body-sm transition-colors disabled:cursor-default ${
              mine ? 'border-primary text-text' : 'border-border text-text hover:border-border-strong'
            }`}
          >
            {showResults && (
              <span aria-hidden className="absolute inset-y-0 left-0 bg-primary-bg" style={{ width: `${pct}%` }} />
            )}
            <span className="relative flex min-w-0 items-center gap-1.5">
              {mine && <Check className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />}
              <span className="truncate">{o.label}</span>
            </span>
            {showResults && <span className="relative shrink-0 text-meta font-semibold text-muted">{pct}%</span>}
          </button>
        )
      })}
      <p className="text-meta text-subtle">
        {poll.total} {poll.total === 1 ? 'vote' : 'votes'}
        {canVote && poll.myOptionId && ' · tap your pick again to take it back'}
      </p>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}
