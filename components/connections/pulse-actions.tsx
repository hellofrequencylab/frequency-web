'use client'

import { useState, useTransition } from 'react'
import { UserPlus, Check, HandHeart } from 'lucide-react'
import { sendFriendRequest } from '@/app/(main)/people/friend-actions'
import { isError } from '@/lib/action-result'
import { recordWelcome } from '@/lib/connections/welcomes'
import { PulseAvatar } from '@/components/connections/pulse-avatar'

// Client islands for the "Connections this week" pulse (ADR-186, P5 + P3b).
// Each mutates via an existing server action and resolves in place — the pulse
// is a nudge, so there's no page reload.

/** Near-miss "Connect" — sends a friend request, then flips to a quiet
 *  "Request sent" state. Reuses the existing sendFriendRequest action. */
export function PulseConnectButton({ targetId }: { targetId: string }) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-2xs font-medium text-muted">
        <Check className="h-3.5 w-3.5" />
        Request sent
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendFriendRequest(targetId)
          if (!isError(result)) setSent(true)
        })
      }
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
    >
      <UserPlus className="h-3.5 w-3.5" />
      Connect
    </button>
  )
}

/** A newcomer row with its own "Welcome" button (ADR-186, P3b). Records the
 *  welcome, pays reward_welcome once, and on success shows a warm "+{gems} 👋"
 *  then removes the row a beat later. The reward is for the act of greeting a
 *  new member — never a ranking, and the row carries no resonance numbers. */
export function PulseWelcomeRow({
  newcomerId,
  handle,
  displayName,
  avatarUrl,
  line,
}: {
  newcomerId: string
  handle: string
  displayName: string
  avatarUrl: string | null
  line: string
}) {
  const [isPending, startTransition] = useTransition()
  const [gems, setGems] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)

  if (hidden) return null

  return (
    <div className="flex items-center gap-3">
      <PulseAvatar href={`/people/${handle}`} displayName={displayName} avatarUrl={avatarUrl} />
      <div className="min-w-0 flex-1">
        <a href={`/people/${handle}`} className="block truncate text-sm font-semibold text-text hover:text-primary-strong">
          {displayName}
        </a>
        <p className="truncate text-2xs text-subtle">{line}</p>
      </div>
      {gems != null ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-2xs font-semibold text-success">
          {gems > 0 ? `+${gems} ` : ''}👋
        </span>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await recordWelcome(newcomerId)
              if (!result.error) {
                setGems(result.gems)
                // Linger on the reward, then quietly clear the row.
                setTimeout(() => setHidden(true), 1600)
              }
            })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <HandHeart className="h-3.5 w-3.5" />
          Welcome
        </button>
      )}
    </div>
  )
}
