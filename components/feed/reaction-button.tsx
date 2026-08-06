'use client'

import { useState, useTransition, useCallback, useRef, useEffect } from 'react'
import { SmilePlus } from 'lucide-react'
import { toggleReaction } from '@/app/(main)/feed/actions'
import { isError } from '@/lib/action-result'
import { REACTIONS, reactionLabel } from '@/lib/feed/reactions'
import { IconButton } from '@/components/ui/icon-button'

// The emoji reactions on every post and comment — the site's highest-frequency
// interaction. Each emoji fills INSTANTLY on click (optimistic), runs the server
// write in the background, and rolls back with a quiet inline note if that write
// rejects. Why a client island: the visual truth is local; the server only confirms
// (no revalidation, so nothing refetches props — the ~3s lag of the old form is gone).
//
// One source of truth for the toggle state — `usePostReactions` — so a post can show
// its COUNTS in one place (beside the comment count) and its emoji PICKER in another
// (inline with the comment box) and the two stay perfectly in sync.

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

export type ReactionState = {
  base: Map<string, Tally>
  toggle: (emoji: string) => void
  failed: boolean
  pending: boolean
}

/** Owns the optimistic reaction state for one post/comment. Call ONCE per entity and
 *  share the result with the counts display + the picker so they never drift. */
export function usePostReactions(
  postId: string,
  reactions: ReactionRow[],
  myProfileId: string | null,
): ReactionState {
  // Base = confirmed server truth, seeded from props and advanced only on a
  // successful write, so a burst of taps never drifts a count.
  const [base, setBase] = useState<Map<string, Tally>>(() => tally(reactions, myProfileId))
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const toggle = useCallback(
    (emoji: string) => {
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

  return { base, toggle, failed, pending }
}

/** The reaction COUNTS — one pill per emoji that has at least one reaction, in the
 *  canonical order. Tappable to toggle. Render this where the tallies should SHOW
 *  (e.g. beside the comment count). Renders nothing when there are no reactions. */
export function ReactionCounts({ base, toggle, failed, compact = false }: ReactionState & { compact?: boolean }) {
  const active = REACTIONS.filter((r) => (base.get(r.key)?.count ?? 0) > 0)
  if (active.length === 0) return null
  const pill = compact
    ? 'flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-2xs font-medium transition-colors'
    : 'flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-meta font-medium transition-colors'
  return (
    <div className="flex flex-wrap items-center gap-0.5">
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
            className={`${pill} ${t.mine ? 'bg-primary-bg/60 text-primary-strong' : 'text-muted hover:bg-surface-elevated'}`}
          >
            <span aria-hidden>{r.key}</span>
            <span className="tabular-nums">{t.count}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The emoji react control: ONE small, neutral trigger that opens the full set in a
 *  popover. Render it on the ACTION LINE beside the reaction counts and the comment
 *  count — the three read as one cluster of chrome, and the comment composer below
 *  gets the whole row to itself.
 *
 * 🔴 THE QUICK STRIP IS GONE, and it was a layout bug rather than a taste call (owner,
 * 2026-08-06: "make sure comment field goes full width"). This used to render the first
 * five emojis as always-visible quick-tap buttons INSIDE the composer row. Five 28px
 * glyphs plus this trigger is ~200px of fixed, non-shrinking width; on a 390px phone
 * that left the `flex-1` textarea about 40px wide — one visible character — with the
 * send button pushed off the card edge. The strip cost the composer more than the tap
 * it saved, so the full set moved into the popover and the row it was squatting on went
 * back to the comment field.
 *
 * `align` decides which edge the popover hangs from. On the action line the trigger sits
 * at the RIGHT edge of the card, so a left-anchored menu would open off-screen; on a
 * comment row it sits at the left. Nothing auto-detects this, so the call site says which. */
export function ReactionInlinePicker({
  base,
  toggle,
  pending,
  align = 'start',
}: ReactionState & { align?: 'start' | 'end' }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

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

  // Emoji GLYPH toggles, not icon buttons -- the reaction itself is the content, so
  // IconButton's icon colour pair is the wrong word for them. What they were missing is the
  // floor: 28px shipped under both the 32px density minimum and the 44px coarse-pointer
  // target, which `tap-target` (the same utility IconButton composes) fixes.
  //
  // NEUTRAL SELECTED STATE (owner: "neutral color in the selector"). `mine` used to paint
  // `bg-primary-bg/60` — a warm amber disc behind the glyph. Inside a popover that is itself
  // a neutral surface, that amber is the loudest thing in the menu, and it competes with the
  // emoji, which is the only thing in here that is SUPPOSED to carry colour. A quiet surface
  // step plus a hairline says "you picked this" just as clearly and lets the six glyphs read
  // as a set. The warm tint still means "mine" out on the COUNT pills, where it is one badge
  // among plain text rather than one of six coloured tiles.
  const emojiBtn = (mine: boolean | undefined) =>
    `tap-target flex h-7 w-7 items-center justify-center rounded-pill text-body transition-transform hover:scale-110 hover:bg-surface-elevated ${
      mine ? 'bg-surface ring-1 ring-border' : ''
    }`

  return (
    <div className="relative shrink-0" ref={pickerRef}>
      <IconButton
        label="Add a reaction"
        onClick={() => setPickerOpen((o) => !o)}
        aria-expanded={pickerOpen}
        disabled={pending}
      >
        {/* 3.5, not 4 — the same glyph size as the comment-count bubble it now sits beside.
            Two icons of the same weight on one line read as a pair; a 16px icon next to a
            14px one reads as one of them being more important. */}
        <SmilePlus className="h-3.5 w-3.5" />
      </IconButton>
      {pickerOpen && (
        <div
          role="menu"
          className={`absolute bottom-full z-20 mb-1.5 flex gap-0.5 rounded-card bg-surface-elevated p-1.5 lift-3 ring-1 ring-border/40 ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {REACTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setPickerOpen(false)
                toggle(r.key)
              }}
              aria-label={r.label}
              title={r.label}
              className={emojiBtn(base.get(r.key)?.mine)}
            >
              <span aria-hidden>{r.key}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The combined bar used on COMMENTS: counts + picker together in one row (a comment
 *  has no separate composer to host the picker, so they stay paired). */
export function ReactionBar({
  postId,
  reactions,
  myProfileId,
  compact = false,
}: {
  postId: string
  reactions: ReactionRow[]
  myProfileId: string | null
  compact?: boolean
}) {
  const state = usePostReactions(postId, reactions, myProfileId)
  // Comments stay tight: the counts plus a SINGLE add button (no quick strip).
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ReactionCounts {...state} compact={compact} />
      <ReactionInlinePicker {...state} />
    </div>
  )
}
