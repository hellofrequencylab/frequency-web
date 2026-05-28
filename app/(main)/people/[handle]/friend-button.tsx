'use client'

import { useTransition } from 'react'
import { UserPlus, Check, Clock, X, UserMinus, UserCheck } from 'lucide-react'
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

  if (state.kind === 'none') {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => sendFriendRequest(targetProfileId).then(() => {}))}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add Friend
      </button>
    )
  }

  if (state.kind === 'pending_outgoing') {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm('Cancel this friend request?')) return
          startTransition(() => cancelFriendRequest(targetProfileId).then(() => {}))
        }}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        title="Click to cancel"
      >
        <Clock className="w-3.5 h-3.5" />
        Request Sent
      </button>
    )
  }

  if (state.kind === 'pending_incoming') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => acceptFriendRequest(targetProfileId).then(() => {}))}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => declineFriendRequest(targetProfileId).then(() => {}))}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          aria-label="Decline"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  // accepted
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Unfriend this person?')) return
        startTransition(() => unfriend(targetProfileId).then(() => {}))
      }}
      className="group flex items-center gap-1.5 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-300 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
      title="Click to unfriend"
    >
      <UserCheck className="w-3.5 h-3.5 group-hover:hidden" />
      <UserMinus className="w-3.5 h-3.5 hidden group-hover:inline" />
      <span className="group-hover:hidden">Friends</span>
      <span className="hidden group-hover:inline">Unfriend</span>
    </button>
  )
}
