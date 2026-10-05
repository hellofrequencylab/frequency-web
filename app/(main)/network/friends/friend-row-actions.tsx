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
} from '../../people/friend-actions'
import { Button } from '@/components/ui/button'
import { isError, type ActionResult } from '@/lib/action-result'

/** Run a friend action and keep its ActionResult error instead of swallowing it, the same way the
 *  profile FriendButton does (SCAN-719). Each button owns its error state and renders it beside
 *  itself; `onSuccess` runs only when the server did not refuse. */
function useFriendAction() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (isError(res)) setError(res.error)
      else onSuccess?.()
    })
  }
  return { isPending, error, run }
}

function ActionError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-meta text-danger">
      {error}
    </p>
  )
}

export function AcceptDeclineButtons({ requesterId }: { requesterId: string }) {
  const { isPending, error, run } = useFriendAction()
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          type="button"
          disabled={isPending}
          onClick={() => run(() => acceptFriendRequest(requesterId))}
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </Button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => declineFriendRequest(requesterId))}
          className="flex items-center gap-1.5 rounded-control border border-border-strong px-3 py-1.5 text-meta font-medium text-muted hover:bg-surface-elevated disabled:opacity-50 transition-colors"
          aria-label="Decline"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ActionError error={error} />
    </div>
  )
}

export function CancelOutgoingButton({ addresseeId }: { addresseeId: string }) {
  const { isPending, error, run } = useFriendAction()
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('Cancel this friend request?')) return
          run(() => cancelFriendRequest(addresseeId))
        }}
        className="flex items-center gap-1.5 rounded-control border border-border-strong px-3 py-1.5 text-meta font-medium text-muted hover:bg-danger-bg hover:border-danger hover:text-danger dark:hover:bg-danger-bg disabled:opacity-50 transition-colors"
      >
        <Clock className="w-3.5 h-3.5" />
        Cancel
      </button>
      <ActionError error={error} />
    </div>
  )
}

/** Send a friend request from a near-miss / reconnect prompt. Once sent we flip
 *  to a quiet "Request sent" state in place (no page reload needed). A refused
 *  request (a block, a duplicate) keeps the button and shows why (SCAN-719). */
export function ConnectButton({ targetId }: { targetId: string }) {
  const { isPending, error, run } = useFriendAction()
  const [sent, setSent] = useState(false)
  if (sent) {
    return (
      <span className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-meta font-medium text-muted">
        <Clock className="w-3.5 h-3.5" />
        Request sent
      </span>
    )
  }
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => sendFriendRequest(targetId), () => setSent(true))}
        className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Connect
      </button>
      <ActionError error={error} />
    </div>
  )
}

/** A gentle "say hi" reconnect nudge for an outer-orbit friend — never guilt, just
 *  a warm open door. Links to the person's profile (where a DM/message lives). */
export function ReconnectButton({ handle }: { handle: string }) {
  return (
    <Link
      href={`/people/${handle}`}
      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-meta font-medium text-muted hover:bg-surface-elevated hover:text-text transition-colors"
    >
      <HeartHandshake className="w-3.5 h-3.5" />
      Say hi
    </Link>
  )
}

export function UnfriendButton({ otherId }: { otherId: string }) {
  const { isPending, error, run } = useFriendAction()
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('Unfriend this person?')) return
          run(() => unfriend(otherId))
        }}
        className="p-1.5 rounded-control text-subtle hover:text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors"
        aria-label="Unfriend"
        title="Unfriend"
      >
        <UserMinus className="w-4 h-4" />
      </button>
      <ActionError error={error} />
    </div>
  )
}
