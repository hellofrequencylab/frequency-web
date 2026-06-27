'use client'

import { useState, useTransition, useCallback, useRef, useEffect } from 'react'
import { SmilePlus } from 'lucide-react'
import { toggleReaction } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'
import { REACTIONS, reactionLabel } from '@/lib/feed/reactions'

// The emoji reactions on every post and comment — the site's highest-frequency
// interaction. Each emoji pill fills INSTANTLY on click (optimistic), runs the
// server write in the background, and rolls back with a quiet inline note if that
// write rejects. A small picker (SmilePlus) opens the full set so a member can add
// a reaction the post doesn't have yet.
//
// Why a client island: the visual truth is local; the server only confirms (no
// revalidation, so nothing refetches props — the ~3s lag of the old form is gone).

/** A reaction as it arrives from the feed RPCs: one row per (post, profile, emoji). */
export type ReactionRow = {
  reaction_type: string
  profile_id: string
}

/** Per-emoji tally derived from the rows, plus whether the viewer holds it. */
type Tally = { count: number; mine: boolean }

function tally(reactions: ReactionRow[], myProfileId: string | null): Map<string, Tally> {
  const map = new Map<string, Tally>()
  for (const r of reactions) {
    const t = map.get(r.reaction_type) ?? { count: 0, mine: false }
    t.count += 1
    if (myProfileId != null && r.profile_id === myProfileId) t.mine = true
    map.set(r.reaction_type, t)
  }
  return map
}

export function ReactionBar({
  postId,
  reactions,
  myProfileId,
  compact = false,
}: {
  postId: string
  reactions: ReactionRow[]
  myProfileId: string | null
  /** Comments render a tighter bar (smaller pills) than top-level posts. */
  compact?: boolean
}) {
  // Base = confirmed server truth, seeded from props and advanced only on a
  // successful write, so a burst of taps never drifts a count.
  const [base, setBase] = useState<Map<string, Tally>>(() => tally(reactions, myProfileId))
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close the picker on an outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const toggle = useCallback(
    (emoji: string) => {
      setPickerOpen(false)
      setFailed(false)
      const current = base.get(emoji) ?? { count: 0, mine: false }
      const willActivate = !current.mine
      // Optimistic: advance a COPY so a failed write can roll back to `base`.
      const next = new Map(base)
      const optimistic: Tally = {
        mine: willActivate,
        count: current.count + (willActivate ? 1 : -1),
      }
      if (optimistic.count <= 0 && !optimistic.mine) next.delete(emoji)
      else next.set(emoji, optimistic)
      setBase(next)
      startTransition(async () => {
        const res = await toggleReaction(postId, emoji, willActivate)
        if (isError(res)) {
          // Roll back to the pre-click truth and flag the failure quietly.
          setBase((prev) => {
            const rolled = new Map(prev)
            if (current.count <= 0 && !current.mine) rolled.delete(emoji)
            else rolled.set(emoji, current)
            return rolled
          })
          setFailed(true)
          return
        }
        // Confirm: trust the server's exact count for this emoji.
        setBase((prev) => {
          const confirmed = new Map(prev)
          if (res.data.count <= 0 && !res.data.active) confirmed.delete(emoji)
          else confirmed.set(emoji, { count: res.data.count, mine: res.data.active })
          return confirmed
        })
      })
    },
    [base, postId],
  )

  // Render the emojis that have at least one reaction, in the canonical order.
  const active = REACTIONS.filter((r) => (base.get(r.key)?.count ?? 0) > 0)

  const pillBase = compact
    ? 'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium transition-colors'
    : 'flex min-h-11 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors sm:min-h-0'

  return (
    <div className="flex flex-wrap items-center gap-1">
      {active.map((r) => {
        const t = base.get(r.key)!
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => toggle(r.key)}
            aria-pressed={t.mine}
            aria-label={reactionLabel(r.key)}
            title={failed ? 'That did not save. Tap to try again.' : reactionLabel(r.key)}
            className={`${pillBase} ${
              t.mine
                ? 'bg-primary-bg/60 text-primary-strong'
                : 'text-subtle hover:bg-surface-elevated hover:text-muted'
            }`}
          >
            <span aria-hidden>{r.key}</span>
            {t.count > 0 && <span>{t.count}</span>}
          </button>
        )
      })}

      {/* Add-a-reaction picker. */}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Add a reaction"
          aria-expanded={pickerOpen}
          disabled={pending}
          className={
            compact
              ? 'flex items-center rounded-full px-1.5 py-0.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-muted'
              : 'flex min-h-11 items-center rounded-full px-2 py-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-muted sm:min-h-0'
          }
        >
          <SmilePlus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
        {pickerOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-0 z-20 mb-1.5 flex gap-0.5 rounded-2xl bg-surface-elevated p-1.5 shadow-lg ring-1 ring-border/40"
          >
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                role="menuitem"
                onClick={() => toggle(r.key)}
                aria-label={r.label}
                title={r.label}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-base transition-transform hover:scale-110 hover:bg-surface ${
                  base.get(r.key)?.mine ? 'bg-primary-bg/60' : ''
                }`}
              >
                <span aria-hidden>{r.key}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
