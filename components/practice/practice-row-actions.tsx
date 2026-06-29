'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, MoreHorizontal, Pencil } from 'lucide-react'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { UnlogPracticeButton } from '@/components/practice/unlog-practice-button'
import { RemovePracticeButton } from '@/components/practice/remove-practice-button'
import type { TimerKind, MindlessMode, PartialToday } from '@/lib/practices'
import type { MovementConfig } from '@/lib/movement'

// The "your practices" tight action row (WEBSITE-CHANGES-PLAN B.3 + B.4). One
// button + one link per practice: "Log practice" and "View practice" (the row
// title already links to the practice; this is the explicit affordance).
//
// B.4 disappear-after-log: this client wrapper holds the logged state, seeded
// from the server (`loggedToday`) so a practice already logged today renders
// WITHOUT the button on first paint. On a successful log the whole action row
// collapses to a quiet "Logged today" line, so a logged practice never keeps a
// live button. Editing/removing move OFF the primary row into a small overflow
// menu (owner only), keeping the row tight.
export function PracticeRowActions({
  practiceId,
  title,
  href,
  loggedToday,
  timerKind,
  mindlessMode,
  movementConfig,
  partialToday,
  isOwner,
  compact = false,
}: {
  practiceId: string
  title: string
  /** The practice detail page, for the explicit "View practice" link. */
  href: string
  /** Server-seeded: already logged today → collapsed on first paint. */
  loggedToday: boolean
  /** Which timer the practice routes to — so the row's button opens the right timer/sheet
   *  (and a partial can resume it). Omit for the plain one-tap log. */
  timerKind?: TimerKind
  /** The Mindless flavour, advisory, for a timer_kind = 'mindless' practice. */
  mindlessMode?: MindlessMode | null
  /** The Movement config (its mode opens the timer) for a timer_kind = 'movement' practice. */
  movementConfig?: MovementConfig | null
  /** A banked-but-unfinished log today → the row shows "Continue Practice" (resumes the timer
   *  for the remaining time) instead of collapsing to "Logged today". */
  partialToday?: PartialToday | null
  /** The viewer created this practice → can edit/remove it from the overflow. */
  isOwner: boolean
  /** Compact host (a vertical card whose title already links to the practice): drop the
   *  explicit "View practice" link so the row stays one button + overflow. */
  compact?: boolean
}) {
  const [logged, setLogged] = useState(loggedToday)

  // A PARTIAL today wins over the collapsed "Logged today" line: the member wants to finish the
  // rest, so the row offers "Continue Practice" (resumes the right timer) plus the same Undo +
  // owner overflow. Only a partial on a TIMED practice can resume; a non-timed partial can't, so
  // it falls through to the normal logged-state collapse.
  const canResume = !!partialToday && timerKind != null && timerKind !== 'none'
  if (logged && canResume && partialToday) {
    return (
      <div className="flex items-center gap-2">
        <LogPracticeButton
          practiceId={practiceId}
          timerKind={timerKind}
          mindlessMode={mindlessMode}
          movementConfig={movementConfig}
          resumeFromSec={partialToday.bankedSec}
          secondsTarget={partialToday.targetSec}
        />
        <UnlogPracticeButton practiceId={practiceId} onUnlogged={() => setLogged(false)} />
        {isOwner && <OwnerMenu practiceId={practiceId} title={title} />}
      </div>
    )
  }

  // Once logged today, the action row collapses to a calm "Logged today" line, with a
  // quiet "Undo" for a mistaken log (today-only, B.1). Undoing flips the row back so the
  // "Log practice" button returns.
  if (logged) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <Check className="h-4 w-4" aria-hidden /> Logged today
        </span>
        <UnlogPracticeButton practiceId={practiceId} onUnlogged={() => setLogged(false)} />
        {isOwner && <OwnerMenu practiceId={practiceId} title={title} />}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Route by timer_kind so a TIMED practice opens its timer (and auto-starts) instead of
          one-tapping a log the server would refuse. Only a timed kind ('mindless' | 'movement')
          switches the button into timer mode; a non-timed ('none' / unset) practice keeps the
          plain one-tap log path untouched. */}
      <LogPracticeButton
        practiceId={practiceId}
        timerKind={timerKind && timerKind !== 'none' ? timerKind : undefined}
        mindlessMode={mindlessMode}
        movementConfig={movementConfig}
        onLogged={() => setLogged(true)}
      />
      {!compact && (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
        >
          View practice <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      {isOwner && <OwnerMenu practiceId={practiceId} title={title} />}
    </div>
  )
}

// Edit + Remove, pulled off the primary action row into a quiet overflow so the
// row stays one button + one link. Owner-only (Remove un-adopts; Edit opens the
// builder). Outside-click + Esc close it, mirroring the rooms member-row menu.
function OwnerMenu({ practiceId, title }: { practiceId: string; title: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for ${title}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-subtle transition-colors hover:bg-surface-elevated hover:text-text motion-reduce:transition-none"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <Link
            href={`/practices/${practiceId}/edit`}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-sm text-text transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
          >
            <Pencil className="h-3.5 w-3.5 text-subtle" aria-hidden /> Edit practice
          </Link>
          <div className="border-t border-border px-3 py-2">
            <RemovePracticeButton practiceId={practiceId} title={title} />
          </div>
        </div>
      )}
    </div>
  )
}
