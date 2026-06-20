'use client'

import { useOptimistic, useState, useTransition, useCallback } from 'react'
import { Heart, ThumbsUp } from 'lucide-react'
import { toggleReaction } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'

// The heart / thumbs on every post — the site's highest-frequency interaction.
// It fills INSTANTLY on click (optimistic), runs the server write in the
// background, and rolls back with a quiet inline note if that write rejects.
//
// Why a client island, not a server-action <form>: a plain form submit waits on
// the round-trip (and, before this, three revalidatePaths) before the icon even
// filled — the ~3s lag. Here the visual truth is local; the server only confirms.

type ReactionType = 'heart' | 'plus_one'

// The server truth this button renders, held locally so repeat taps stay correct
// even though the action no longer revalidates the feed (nothing refetches props).
type ReactionState = { active: boolean; count: number }

const ICONS = { heart: Heart, plus_one: ThumbsUp } as const

// Active color per reaction, on semantic tokens (no hex): a heart reads as
// affection (danger/red), a plus reads as endorsement (primary).
const ACTIVE_CLASS = {
  heart: 'text-danger',
  plus_one: 'text-primary-strong',
} as const

export function ReactionButton({
  postId,
  reactionType,
  initialActive,
  initialCount,
}: {
  postId: string
  reactionType: ReactionType
  initialActive: boolean
  initialCount: number
}) {
  // Base = confirmed server truth. Seeded from props, advanced only on a
  // successful write, so a burst of taps never drifts the count.
  const [base, setBase] = useState<ReactionState>({
    active: initialActive,
    count: initialCount,
  })
  const [optimistic, applyOptimistic] = useOptimistic(
    base,
    (_prev, next: ReactionState) => next,
  )
  const [, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const Icon = ICONS[reactionType]
  const activeClass = ACTIVE_CLASS[reactionType]
  const label = reactionType === 'heart' ? 'Love this' : 'Endorse this'

  const onClick = useCallback(() => {
    const willActivate = !optimistic.active
    const next: ReactionState = {
      active: willActivate,
      count: optimistic.count + (willActivate ? 1 : -1),
    }
    setFailed(false)
    startTransition(async () => {
      // Optimistic update lives INSIDE the transition (React requirement); the
      // icon fills before the await resolves.
      applyOptimistic(next)
      const res = await toggleReaction(postId, reactionType, willActivate)
      if (isError(res)) {
        // Roll back: leave `base` untouched so the optimistic value snaps back
        // to server truth when the transition settles, and show a quiet note.
        setFailed(true)
        return
      }
      // Confirm: advance the base to what the server now holds.
      setBase(res.data)
    })
  }, [optimistic, applyOptimistic, postId, reactionType])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={optimistic.active}
      aria-label={label}
      title={failed ? 'That did not save. Tap to try again.' : label}
      className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:min-h-0 ${
        optimistic.active
          ? activeClass
          : 'text-subtle hover:bg-surface-elevated hover:text-muted'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${optimistic.active ? 'fill-current' : ''}`} />
      {optimistic.count > 0 && <span>{optimistic.count}</span>}
    </button>
  )
}
