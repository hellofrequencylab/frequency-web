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
}: {
  targetProfileId: string
  state: FriendState
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
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
        className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-elevated disabled:opacity-50 transition-colors"
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
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => declineFriendRequest(targetProfileId))}
          className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-elevated disabled:opacity-50 transition-colors"
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
        className="group flex items-center gap-1.5 rounded-lg border border-success bg-success-bg/30 px-3 py-1.5 text-sm font-medium text-success hover:border-danger hover:bg-danger-bg hover:text-danger dark:hover:bg-danger-bg dark:hover:text-danger disabled:opacity-50 transition-colors"
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
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
