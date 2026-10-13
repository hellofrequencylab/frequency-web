'use client'

import { useState, useTransition } from 'react'
import { setLeaderboardVisibility } from '@/app/(main)/crew/leaderboard/actions'

// The board's quiet "hide me" switch in the kit (the DAWN BoardControls toggle, on the same action).
// It flips at once and settles back if the write is refused.
export function FqBoardHide({ hidden, basePath }: { hidden: boolean; basePath: string }) {
  const [isHidden, setIsHidden] = useState(hidden)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      className="btn sm txt"
      aria-pressed={isHidden}
      disabled={pending}
      onClick={() => {
        const next = !isHidden
        setIsHidden(next)
        start(async () => {
          const res = await setLeaderboardVisibility(next, basePath)
          if (!res.ok) setIsHidden(!next)
        })
      }}
    >
      {isHidden ? 'Show me on the board' : 'Hide me from the board'}
    </button>
  )
}
