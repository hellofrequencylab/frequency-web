'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { toggleDispatchLike } from '../actions'

export function LikeButton({
  dispatchId,
  initialCount,
  initialLiked,
  isLoggedIn,
}: {
  dispatchId: string
  initialCount: number
  initialLiked: boolean
  isLoggedIn: boolean
}) {
  const [liked,    setLiked]    = useState(initialLiked)
  const [count,    setCount]    = useState(initialCount)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    if (!isLoggedIn) return
    const next = !liked
    setLiked(next)
    setCount(c => next ? c + 1 : Math.max(0, c - 1))
    startTransition(async () => {
      try {
        await toggleDispatchLike(dispatchId)
      } catch {
        // revert on error
        setLiked(!next)
        setCount(c => !next ? c + 1 : Math.max(0, c - 1))
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending || !isLoggedIn}
      title={isLoggedIn ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 ${
        liked
          ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:border-rose-200 hover:text-rose-500 dark:hover:text-rose-400'
      }`}
    >
      <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
      <span>{count > 0 ? count : ''} {count === 1 ? 'like' : count > 1 ? 'likes' : 'Like'}</span>
    </button>
  )
}
