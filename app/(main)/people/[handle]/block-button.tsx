'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { blockProfileAction, unblockProfileAction } from './actions'

// Block / unblock a member. Blocking stops DMs both ways and unfriends; a short
// inline confirm guards the destructive action.
export function BlockButton({
  profileId,
  blocked,
  variant = 'button',
}: {
  profileId: string
  blocked: boolean
  /** 'link' renders a small, borderless text link (for the secondary actions row). */
  variant?: 'button' | 'link'
}) {
  const [isBlocked, setIsBlocked] = useState(blocked)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const isLink = variant === 'link'
  const base = isLink
    ? 'inline-flex items-center gap-1 text-xs font-medium transition-colors'
    : 'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors'
  const icon = isLink ? 'w-3 h-3' : 'w-3.5 h-3.5'

  const withError = (control: React.ReactNode) => (
    <span className="inline-flex flex-col gap-1">
      {control}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )

  if (isBlocked) {
    return withError(
      <button
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            // Only flip the control once the write actually landed — the old code
            // showed "Unblock" as done even when the action reported failure.
            try {
              const res = await unblockProfileAction(profileId)
              if (!res.ok) { setError('Could not unblock this member. Please try again.'); return }
              setIsBlocked(false)
              router.refresh()
            } catch {
              setError('Could not unblock this member. Please try again.')
            }
          })
        }}
        className={`${base} ${
          isLink
            ? 'text-subtle hover:text-text hover:underline disabled:opacity-60'
            : 'border-border text-muted hover:text-text hover:border-border-strong disabled:opacity-60'
        }`}
      >
        <Ban className={icon} />
        {pending ? 'Unblocking…' : 'Unblock'}
      </button>,
    )
  }

  if (confirming) {
    return withError(
      <span className={isLink ? 'inline-flex items-center gap-2' : 'flex items-center gap-1.5'}>
        <button
          disabled={pending}
          onClick={() => {
            setError(null)
            start(async () => {
              try {
                const res = await blockProfileAction(profileId)
                if (!res.ok) { setError('Could not block this member. Please try again.'); return }
                setIsBlocked(true)
                setConfirming(false)
                router.refresh()
              } catch {
                setError('Could not block this member. Please try again.')
              }
            })
          }}
          className={`${base} ${
            isLink ? 'text-danger hover:underline disabled:opacity-60' : 'border-danger bg-danger text-white disabled:opacity-60'
          }`}
        >
          {pending ? 'Blocking…' : 'Confirm block'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className={`${base} ${isLink ? 'text-subtle hover:text-text hover:underline' : 'border-border text-text'}`}
        >
          Cancel
        </button>
      </span>,
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`${base} ${
        isLink ? 'text-subtle hover:text-danger hover:underline' : 'border-border text-muted hover:text-danger hover:border-danger'
      }`}
    >
      <Ban className={icon} />
      Block
    </button>
  )
}
