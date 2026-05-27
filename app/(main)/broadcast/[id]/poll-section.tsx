'use client'

import { useState, useTransition } from 'react'
import { castVote } from '../actions'

type PollOption = {
  id: string
  label: string
  position: number
  voteCount: number
}

export function PollSection({
  dispatchId,
  options,
  myVotedOptionId,
  isLoggedIn,
}: {
  dispatchId: string
  options: PollOption[]
  myVotedOptionId: string | null
  isLoggedIn: boolean
}) {
  const [votedId, setVotedId] = useState<string | null>(myVotedOptionId)
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(options.map(o => [o.id, o.voteCount]))
  )
  const [isPending, startTransition] = useTransition()

  const totalVotes = Object.values(counts).reduce((s, c) => s + c, 0)
  const hasVoted = votedId !== null

  function handleVote(optionId: string) {
    if (!isLoggedIn || isPending) return

    const prevVotedId = votedId
    const prevCounts = { ...counts }

    // Optimistic update
    const nextCounts = { ...counts }
    if (prevVotedId === optionId) {
      nextCounts[optionId] = Math.max(0, nextCounts[optionId] - 1)
      setVotedId(null)
    } else {
      if (prevVotedId) nextCounts[prevVotedId] = Math.max(0, nextCounts[prevVotedId] - 1)
      nextCounts[optionId] = (nextCounts[optionId] ?? 0) + 1
      setVotedId(optionId)
    }
    setCounts(nextCounts)

    startTransition(async () => {
      try {
        await castVote(optionId, dispatchId)
      } catch {
        // Revert on error
        setCounts(prevCounts)
        setVotedId(prevVotedId)
      }
    })
  }

  return (
    <div className="mt-8 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-5">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400 mb-4">
        Poll · {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
      </p>

      <div className="space-y-2.5">
        {[...options].sort((a, b) => a.position - b.position).map(opt => {
          const count = counts[opt.id] ?? 0
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const isMyVote = votedId === opt.id

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={!isLoggedIn || isPending}
              className={`relative w-full text-left rounded-lg border px-4 py-2.5 transition-colors overflow-hidden ${
                isMyVote
                  ? 'border-blue-400 dark:border-blue-600 bg-blue-100/80 dark:bg-blue-900/40'
                  : hasVoted
                  ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-default'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20'
              } disabled:cursor-not-allowed`}
            >
              {/* Vote bar background */}
              {hasVoted && (
                <span
                  className="absolute inset-y-0 left-0 bg-blue-100 dark:bg-blue-900/30 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className={`text-sm font-medium ${isMyVote ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  {opt.label}
                  {isMyVote && <span className="ml-1 text-xs">✓</span>}
                </span>
                {hasVoted && (
                  <span className="text-xs font-semibold text-gray-500 shrink-0">{pct}%</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {!isLoggedIn && (
        <p className="mt-3 text-xs text-gray-400 text-center">Sign in to vote</p>
      )}
    </div>
  )
}
