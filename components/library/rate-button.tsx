'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { rateContent } from '@/app/(main)/library/actions'
import { isError } from '@/lib/action-result'
import type { ContentType } from '@/lib/library'

// A "love" toggle: the ratings signal that feeds the best-of score (community_library RPC).
// Moved here from the retired /library page (LIVE-681, ADR-1678) so the practices-best-of block on
// /practices can carry it. Optimistic: the count flips at once and rolls back if the action refuses.
export function RateButton({ type, id, count, rated }: { type: ContentType; id: string; count: number; rated: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [on, setOn] = useState(rated)
  const [n, setN] = useState(count)
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on
          setOn(next)
          setN((v) => v + (next ? 1 : -1))
          const res = await rateContent(type, id)
          if (isError(res)) { setOn(!next); setN((v) => v + (next ? -1 : 1)) }
          else router.refresh()
        })
      }
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-meta font-semibold transition-colors disabled:opacity-50 ${
        on ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-muted hover:text-text'
      }`}
      title={on ? 'Remove your rating' : 'Rate this'}
    >
      <Heart className={`h-3.5 w-3.5 ${on ? 'fill-current' : ''}`} /> {n}
    </button>
  )
}
