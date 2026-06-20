'use client'

import { useEffect, useState, useTransition } from 'react'
import { Users } from 'lucide-react'
import { fieldClasses } from '@/components/ui/field'
import { countSpaceAudience } from '@/lib/spaces/campaigns-actions'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import { cn } from '@/lib/utils'

// AUDIENCE PICKER (ENTITY-SPACES-BUILD §C Phase 3, "audience builder over contacts"). The owner picks
// who a campaign goes to: everyone in this Space, or one tag. A LIVE count updates as they pick
// (countSpaceAudience, gated on canEditProfile server-side). It is a controlled component: the parent
// holds the filter + count so the Send control can show the same number and pass the same filter to
// the send action (the count can never disagree with the send, because both resolve the same way).
//
// Copy passes CONTENT-VOICE: plain, concrete, no narrated feelings, no em/en dashes.

export function AudiencePicker({
  spaceId,
  tags,
  filter,
  onFilterChange,
  onCountChange,
  disabled = false,
}: {
  spaceId: string
  /** The tags available to filter by (resolved server-side). Empty = only "everyone". */
  tags: string[]
  filter: AudienceFilter
  onFilterChange: (filter: AudienceFilter) => void
  onCountChange?: (count: number) => void
  disabled?: boolean
}) {
  const [count, setCount] = useState<number | null>(null)
  const [pending, start] = useTransition()

  // Re-resolve the live count whenever the filter changes. The server action is the source of truth
  // (and the same resolver the send uses), so the number the owner sees is the number who get the
  // email.
  useEffect(() => {
    let cancelled = false
    start(async () => {
      const n = await countSpaceAudience(spaceId, filter)
      if (cancelled) return
      setCount(n)
      onCountChange?.(n)
    })
    return () => {
      cancelled = true
    }
    // onFilterChange/onCountChange are stable enough; we re-run on the filter's tag only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, filter.tag])

  const tag = filter.tag ?? ''

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-text">Audience</p>
        <p className="mt-0.5 text-xs text-muted">
          Pick who gets this. We send to your own contacts, never anyone else&rsquo;s.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Send to</span>
        <select
          value={tag}
          disabled={disabled}
          onChange={(e) => onFilterChange({ tag: e.target.value || null })}
          className={cn(fieldClasses, 'max-w-xs')}
        >
          <option value="">Everyone in this space</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              Tagged {t}
            </option>
          ))}
        </select>
      </label>

      <p className="inline-flex items-center gap-1.5 text-sm text-muted" role="status" aria-live="polite">
        <Users className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        {pending || count == null ? (
          <span>Counting&hellip;</span>
        ) : (
          <span>
            <span className="font-semibold text-text tabular-nums">{count.toLocaleString()}</span>{' '}
            {count === 1 ? 'person' : 'people'} will get this
          </span>
        )}
      </p>
    </div>
  )
}
