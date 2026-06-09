'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, X, Clock, UserMinus, UserPlus, HeartHandshake } from 'lucide-react'
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  unfriend,
} from '../people/friend-actions'

export function AcceptDeclineButtons({ requesterId }: { requesterId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => acceptFriendRequest(requesterId).then(() => {}))}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
        Accept
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => declineFriendRequest(requesterId).then(() => {}))}
        className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated disabled:opacity-50 transition-colors"
        aria-label="Decline"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function CancelOutgoingButton({ addresseeId }: { addresseeId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Cancel this friend request?')) return
        startTransition(() => cancelFriendRequest(addresseeId).then(() => {}))
      }}
      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-muted hover:bg-danger-bg hover:border-danger hover:text-danger dark:hover:bg-danger-bg disabled:opacity-50 transition-colors"
    >
      <Clock className="w-3.5 h-3.5" />
      Cancel
    </button>
  )
}

/** Send a friend request from a near-miss / reconnect prompt. Once sent we flip
 *  to a quiet "Request sent" state in place (no page reload needed). */
export function ConnectButton({ targetId }: { targetId: string }) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  if (sent) {
    return (
      <span className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-muted">
        <Clock className="w-3.5 h-3.5" />
        Request sent
      </span>
    )
  }
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => sendFriendRequest(targetId).then(() => setSent(true)))}
      className="shrink-0 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
    >
      <UserPlus className="w-3.5 h-3.5" />
      Connect
    </button>
  )
}

/** A gentle "say hi" reconnect nudge for an outer-orbit friend — never guilt, just
 *  a warm open door. Links to the person's profile (where a DM/message lives). */
export function ReconnectButton({ handle }: { handle: string }) {
  return (
    <Link
      href={`/people/${handle}`}
      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-text transition-colors"
    >
      <HeartHandshake className="w-3.5 h-3.5" />
      Say hi
    </Link>
  )
}

export function UnfriendButton({ otherId }: { otherId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Unfriend this person?')) return
        startTransition(() => unfriend(otherId).then(() => {}))
      }}
      className="shrink-0 p-1.5 rounded-lg text-subtle hover:text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors"
      aria-label="Unfriend"
      title="Unfriend"
    >
      <UserMinus className="w-4 h-4" />
    </button>
  )
}
