'use client'

import { useState, useRef, useTransition } from 'react'
import { Check, Clock, Circle, CircleDot, AlertTriangle, Zap } from 'lucide-react'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { showZapToast } from '@/components/zap-toast'
import { fireJourneyComplete } from '@/components/journey/journey-celebration'
import { TIER_META } from '@/components/journey/tier-meta'
import { cn } from '@/lib/utils'
import type { IntensityTier } from '@/lib/journey-tiers'

// The full step checklist (docs/JOURNEYS.md §10). Three states per step, derived from the
// Rhythm clock (met / loggedThisWeek / target):
//   • on-track  — met this week (green check)
//   • behind    — started but under target (warning)
//   • not-started — nothing logged this week (hollow)
// Each row shows its resolved tier. Rows are swipe-to-log on touch (drag left→right past a
// threshold logs the practice) AND have an explicit Log control for pointer/keyboard — the
// swipe is an enhancement, never the only path (a11y).

const COMPLETE = /journey complete|complete/i

interface JourneyReward {
  bonuses?: { label: string; kind: 'zaps' | 'gems'; amount: number }[]
  zaps?: number
  gems?: number
}

export interface ChecklistRow {
  key: string
  practiceId: string | null
  title: string
  cadence: string | null
  target: number
  loggedThisWeek: number
  met: boolean
  resolvedTier: IntensityTier
}

type RowState = 'on-track' | 'behind' | 'not-started'

function rowState(r: ChecklistRow): RowState {
  if (r.met) return 'on-track'
  return r.loggedThisWeek > 0 ? 'behind' : 'not-started'
}

const STATE_META: Record<RowState, { label: string; cls: string; Icon: typeof Circle }> = {
  'on-track': { label: 'On track', cls: 'text-success', Icon: Check },
  behind: { label: 'Behind', cls: 'text-warning', Icon: AlertTriangle },
  'not-started': { label: 'Not started', cls: 'text-subtle', Icon: Circle },
}

const SWIPE_THRESHOLD = 72 // px drag before a swipe-to-log commits

function Row({
  row,
  circleId,
  planTitle,
  onLogged,
}: {
  row: ChecklistRow
  circleId?: string | null
  planTitle: string
  onLogged: (key: string) => void
}) {
  const [pending, start] = useTransition()
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)
  const state = rowState(row)
  const meta = STATE_META[state]
  const tier = TIER_META[row.resolvedTier]
  const logged = state === 'on-track'

  function doLog() {
    if (!row.practiceId || pending || logged) return
    start(async () => {
      const res = await logPracticeAction(row.practiceId as string, circleId)
      if (isError(res)) return
      const { logged: didLog, zapsAwarded } = res.data
      const journey = (res.data as { journey?: JourneyReward }).journey
      if (didLog && zapsAwarded > 0) showZapToast({ amount: zapsAwarded, label: 'Practice logged' })
      for (const b of journey?.bonuses ?? []) {
        if (b.kind === 'zaps' && b.amount > 0) showZapToast({ amount: b.amount, label: b.label })
      }
      if ((journey?.bonuses ?? []).some((b) => COMPLETE.test(b.label))) {
        fireJourneyComplete({ title: planTitle, gems: journey?.gems })
      }
      onLogged(row.key)
    })
  }

  // Touch swipe (left→right) to log. Pointer/keyboard use the explicit button.
  function onTouchStart(e: React.TouchEvent) {
    if (logged || !row.practiceId) return
    startX.current = e.touches[0].clientX
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null) return
    const dx = e.touches[0].clientX - startX.current
    setDragX(Math.max(0, Math.min(dx, SWIPE_THRESHOLD + 24)))
  }
  function onTouchEnd() {
    if (startX.current == null) return
    if (dragX >= SWIPE_THRESHOLD) doLog()
    setDragX(0)
    startX.current = null
  }

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Swipe affordance revealed behind the row as you drag. */}
      {!logged && row.practiceId && (
        <div className="absolute inset-y-0 left-0 flex items-center gap-1.5 bg-primary-bg pl-4 text-xs font-semibold text-primary-strong">
          <Zap className="h-3.5 w-3.5" /> Log
        </div>
      )}
      <div
        className={cn(
          'flex items-center gap-3 border bg-surface px-4 py-3 shadow-sm transition-transform',
          logged ? 'border-success-bg' : 'border-border',
          dragX === 0 ? 'rounded-2xl' : 'rounded-2xl',
        )}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <span className={cn('shrink-0', meta.cls)}>
          {logged ? <CircleDot className="h-5 w-5" /> : <meta.Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('truncate text-sm font-semibold', logged ? 'text-muted' : 'text-text')}>
              {row.title}
            </span>
            <span className="shrink-0 text-xs" title={tier.blurb} aria-label={tier.label}>
              {tier.glyph}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
            <span className={cn('font-medium', meta.cls)}>{meta.label}</span>
            <span className="tabular-nums">
              · {row.loggedThisWeek}/{row.target} this week
            </span>
            {row.cadence && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {row.cadence}
              </span>
            )}
          </div>
        </div>
        {row.practiceId && (
          <button
            type="button"
            onClick={doLog}
            disabled={pending || logged}
            aria-label={logged ? 'Logged today' : `Log ${row.title}`}
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
              logged
                ? 'bg-success-bg text-success'
                : 'bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60',
            )}
          >
            {logged ? <Check className="h-3.5 w-3.5" /> : pending ? '…' : 'Log'}
          </button>
        )}
      </div>
    </li>
  )
}

export function StepChecklist({
  rows: initialRows,
  circleId,
  planTitle,
}: {
  rows: ChecklistRow[]
  circleId?: string | null
  planTitle: string
}) {
  // Optimistically mark a row on-track once logged this session.
  const [logged, setLogged] = useState<Set<string>>(new Set())
  const markLogged = (key: string) => setLogged((prev) => new Set(prev).add(key))

  const rows = initialRows.map((r) =>
    logged.has(r.key) ? { ...r, met: true, loggedThisWeek: Math.max(r.loggedThisWeek, r.target) } : r,
  )

  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <Row key={row.key} row={row} circleId={circleId} planTitle={planTitle} onLogged={markLogged} />
      ))}
    </ol>
  )
}
