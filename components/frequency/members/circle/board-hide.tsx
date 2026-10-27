'use client'

import { useState, useTransition } from 'react'
import { setLeaderboardVisibility } from '@/app/(main)/crew/leaderboard/actions'

// The board's quiet "hide me" switch in the kit (the DAWN BoardControls toggle, on the same action).
// It flips at once and settles back if the write is refused.
export function FqBoardHide({ hidden, basePath }: { hidden: boolean; basePath: string }) {
  const [isHidden, setIsHidden] = useState(hidden)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
    <button
      type="button"
      className="btn sm txt"
      aria-pressed={isHidden}
      disabled={pending}
      onClick={() => {
        const next = !isHidden
        setError(null)
        setIsHidden(next)
        start(async () => {
          try {
            const res = await setLeaderboardVisibility(next, basePath)
            if (res.ok) return
          } catch { /* A rejected action has the same recovery as a refused write. */ }
          setIsHidden(!next)
          setError('That did not save. Try again.')
        })
      }}
    >
      {isHidden ? 'Show me on the board' : 'Hide me from the board'}
    </button>
    {error && <p role="alert" className="t2">{error}</p>}
    </>
  )
}
