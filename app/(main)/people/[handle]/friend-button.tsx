'use client'

import { useState, useTransition } from 'react'
import { UserPlus, Check, Clock, X, UserMinus, UserCheck } from 'lucide-react'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  unfriend,
} from '../friend-actions'

export type FriendState =
  | { kind: 'none' }
  | { kind: 'pending_outgoing' }   // I sent the request, waiting
  | { kind: 'pending_incoming' }   // They sent me a request
  | { kind: 'accepted' }

export function FriendButton({
  targetProfileId,
  state,
  onMedia = false,
}: {
  targetProfileId: string
  state: FriendState
  /** True when this button rides a cover photo (an adaptive PageHero's `actions` slot). The
   *  neutral states then take their border/glass/text from the hero ZONE's `--color-on-media`
   *  instead of the page-canvas tokens, which are unreadable over an arbitrary photo. The
   *  PRIMARY states ("Add Friend" / "Accept") deliberately keep `bg-primary text-on-primary`:
   *  an accent CTA is opaque, is meant to stand out, and reads on any backdrop. */
  onMedia?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Same geometry either way; only the colour source changes. `.hero-chip` lives in globals.css
  // and is the class half of HERO_ACTION_CLASS_ADAPTIVE.
  const neutralClass = onMedia
    ? 'hero-chip flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-sm font-medium disabled:opacity-50 transition-colors'
    : 'flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-body-sm font-medium text-muted hover:bg-surface-elevated disabled:opacity-50 transition-colors'

  // Run a friend action and surface its ActionResult error instead of swallowing it.
  function run(action: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (isError(res)) setError(res.error)
    })
  }

  let content: React.ReactNode

  if (state.kind === 'none') {
    content = (
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => sendFriendRequest(targetProfileId))}
        className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add Friend
      </button>
    )
  } else if (state.kind === 'pending_outgoing') {
    content = (
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('Cancel this friend request?')) return
          run(() => cancelFriendRequest(targetProfileId))
        }}
        className={neutralClass}
        title="Click to cancel"
      >
        <Clock className="w-3.5 h-3.5" />
        Request Sent
      </button>
    )
  } else if (state.kind === 'pending_incoming') {
    content = (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => acceptFriendRequest(targetProfileId))}
          className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => declineFriendRequest(targetProfileId))}
          className={neutralClass}
          aria-label="Decline"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  } else {
    // accepted
    content = (
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('Unfriend this person?')) return
          run(() => unfriend(targetProfileId))
        }}
        className={`group ${onMedia ? neutralClass : 'flex items-center gap-1.5 rounded-control border border-success bg-success-bg/30 px-3 py-1.5 text-body-sm font-medium text-success disabled:opacity-50 transition-colors'} hover:border-danger hover:bg-danger-bg hover:text-danger dark:hover:bg-danger-bg dark:hover:text-danger`}
        title="Click to unfriend"
      >
        <UserCheck className="w-3.5 h-3.5 group-hover:hidden" />
        <UserMinus className="w-3.5 h-3.5 hidden group-hover:inline" />
        <span className="group-hover:hidden">Friends</span>
        <span className="hidden group-hover:inline">Unfriend</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {content}
      {/* The refusal has to read where the button reads. On a cover the danger token is a
          page-canvas colour, so it takes the zone's on-media tone with the halo behind it. */}
      {/* The refusal cap is 16rem = 272px, which is WIDER than the whole hero content box on a
          320px phone (~245px), so an errored button became the widest thing on its flex line and
          got clipped by the hero's overflow — the refusal was painted off the page. 13rem = 221px
          fits the narrowest supported width; the `sm:` pair restores 16rem from 640px up. */}
      {error && <p className={onMedia ? 'max-w-[13rem] text-meta text-on-media sm:max-w-[16rem]' : 'text-meta text-danger'}>{error}</p>}
    </div>
  )
}
