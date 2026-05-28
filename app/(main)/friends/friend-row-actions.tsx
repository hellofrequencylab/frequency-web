'use client'

import { useTransition } from 'react'
import { Check, X, Clock, UserMinus } from 'lucide-react'
import {
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
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
        Accept
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => declineFriendRequest(requesterId).then(() => {}))}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
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
      className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
    >
      <Clock className="w-3.5 h-3.5" />
      Cancel
    </button>
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
      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
      aria-label="Unfriend"
      title="Unfriend"
    >
      <UserMinus className="w-4 h-4" />
    </button>
  )
}
