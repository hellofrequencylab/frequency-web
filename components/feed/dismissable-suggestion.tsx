'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { hideSuggestionAction } from '@/app/(main)/feed/people-actions'

// Wraps a suggested PersonCard with a quiet "X" to remove it (Resonance Feed Phase 3,
// ADR-417). Optimistic: the card disappears the instant you tap, and the hide is
// written to suggestion_hidden in the background so the person never resurfaces. No
// swipe mechanics, just a calm dismiss. The card itself is a Server Component passed
// as children, so this client wrapper holds only the dismiss state.
export function DismissableSuggestion({
  profileId,
  name,
  children,
}: {
  profileId: string
  name: string
  children: ReactNode
}) {
  const [hidden, setHidden] = useState(false)
  const [, startTransition] = useTransition()
  if (hidden) return null

  return (
    <div className="relative">
      {children}
      <button
        type="button"
        aria-label={`Remove ${name} from suggestions`}
        onClick={() => {
          setHidden(true)
          startTransition(async () => {
            await hideSuggestionAction(profileId)
          })
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-surface/85 p-1 text-subtle shadow-sm transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
