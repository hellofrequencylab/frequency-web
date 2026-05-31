'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { blockProfileAction, unblockProfileAction } from './actions'

// Block / unblock a member. Blocking stops DMs both ways and unfriends; a short
// inline confirm guards the destructive action.
export function BlockButton({ profileId, blocked }: { profileId: string; blocked: boolean }) {
  const [isBlocked, setIsBlocked] = useState(blocked)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  const base =
    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors'

  if (isBlocked) {
    return (
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await unblockProfileAction(profileId)
            setIsBlocked(false)
            router.refresh()
          })
        }
        className={`${base} border-border text-muted hover:text-text hover:border-border-strong disabled:opacity-60`}
      >
        <Ban className="w-3.5 h-3.5" />
        {pending ? 'Unblocking…' : 'Unblock'}
      </button>
    )
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await blockProfileAction(profileId)
              setIsBlocked(true)
              setConfirming(false)
              router.refresh()
            })
          }
          className={`${base} border-danger bg-danger text-white disabled:opacity-60`}
        >
          {pending ? 'Blocking…' : 'Confirm block'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className={`${base} border-border text-text`}
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`${base} border-border text-muted hover:text-danger hover:border-danger`}
    >
      <Ban className="w-3.5 h-3.5" />
      Block
    </button>
  )
}
