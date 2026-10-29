'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { SeriesSaveDialog } from '@/app/(main)/spaces/[slug]/settings/calendar/series-choice-dialog'
import { Button } from '@/components/ui/button'
import { Toast } from '@/components/ui/toast'
import type { AdaptedCalendar } from '@/lib/calendar/planner/adapters'
import { addDays } from '@/lib/calendar/planner/days'
import {
  overlayItems,
  overlayTasks,
  planAfter,
  planItemDrop,
  planTodoDrop,
  runWrite,
  type DropOutcome,
  type DropTarget,
  type ItemPlace,
  type MovePlan,
  type TodoPlace,
  type WriteDeps,
} from '@/lib/calendar/planner/drop'
import { SNAP_MINUTES } from '@/lib/calendar/planner/week-layout'
import { useSuiteDnd, type DragSource, type SuiteDnd } from './use-suite-dnd'

// MOVING THINGS ON THE CALENDAR. The one place a drop becomes a change a person sees and can take
// back: the drop is planned (lib/calendar/planner/drop.ts), a repeating date asks which dates it
// reaches, the grid shows the move at once, the existing server action writes it, and a toast offers
// Undo, which is the one write that restores the snapshot. If the server refuses, the grid goes back
// and the toast says why. The records stay the page's: this only lays moved places OVER them until the
// page reloads with the truth, and drops the overlay then.

export type SuiteActions = WriteDeps

const NONE = { items: {}, todos: {} } as const
interface Overlay {
  items: Readonly<Record<string, ItemPlace>>
  todos: Readonly<Record<string, TodoPlace>>
}

interface ToastState {
  id: number
  line: string
  tone: 'success' | 'danger' | 'neutral'
  undo: (() => void) | null
}

/** How long the toast stays, long enough to read the sentence and reach Undo. */
const TOAST_MS = 7000

export interface SuiteMoves {
  /** The calendar with moved places laid over it. */
  data: AdaptedCalendar
  dnd: SuiteDnd
  /** The series question and the toast, to render once inside the calendar. */
  layer: ReactNode
}

export function useSuiteMoves({
  base,
  actions,
  canEdit,
}: {
  base: AdaptedCalendar
  actions: SuiteActions
  canEdit: boolean
}): SuiteMoves {
  const [overlay, setOverlay] = useState<Overlay>(NONE)
  const [seen, setSeen] = useState(base)
  // The page came back with the truth: the overlay has done its job.
  if (seen !== base) {
    setSeen(base)
    setOverlay(NONE)
  }
  const [toast, setToast] = useState<ToastState | null>(null)
  const [ask, setAsk] = useState<Extract<DropOutcome, { kind: 'ask' }> | null>(null)
  const counter = useRef(0)

  const data = useMemo<AdaptedCalendar>(
    () =>
      overlay === NONE || (!Object.keys(overlay.items).length && !Object.keys(overlay.todos).length)
        ? base
        : { ...base, items: overlayItems(base.items, overlay.items), tasks: overlayTasks(base.tasks, overlay.todos) },
    [base, overlay],
  )
  const latest = useRef(data)
  const actionsRef = useRef(actions)
  useEffect(() => {
    latest.current = data
    actionsRef.current = actions
  })

  const say = useCallback((line: string, tone: ToastState['tone'], undo: (() => void) | null = null) => {
    counter.current += 1
    setToast({ id: counter.current, line, tone, undo })
  }, [])

  const show = useCallback((plan: { items: Record<string, ItemPlace>; todo: Record<string, TodoPlace> }) => {
    setOverlay((o) => ({ items: { ...o.items, ...plan.items }, todos: { ...o.todos, ...plan.todo } }))
  }, [])
  const hide = useCallback((plan: MovePlan) => {
    setOverlay((o) => {
      const items = { ...o.items }
      const todos = { ...o.todos }
      for (const c of plan.items) delete items[c.id]
      if (plan.todo) delete todos[plan.todo.id]
      return { items, todos }
    })
  }, [])

  const commit = useCallback(
    async (plan: MovePlan) => {
      show(planAfter(plan))
      const error = await runWrite(plan.write, actionsRef.current)
      if (error) {
        hide(plan)
        say(`Nothing moved. ${error}`, 'danger')
        return
      }
      const undo = plan.undo
      say(
        plan.line,
        'success',
        undo
          ? async () => {
              // Undo is the one write that restores the snapshot. The grid shows it back at once and
              // goes forward again if the server says no.
              hide(plan)
              const failed = await runWrite(undo, actionsRef.current)
              if (failed) {
                show(planAfter(plan))
                say(`Could not undo that. ${failed}`, 'danger')
              } else {
                say('Put it back.', 'neutral')
              }
            }
          : null,
      )
    },
    [hide, say, show],
  )

  const onDrop = useCallback(
    (src: DragSource, target: DropTarget) => {
      if (!canEdit) return
      const cur = latest.current
      let outcome: DropOutcome | null = null
      if (src.kind === 'item') {
        const item = cur.items.find((i) => i.id === src.id)
        outcome = item ? planItemDrop(item, target, cur.items) : null
      } else {
        const task = cur.tasks.find((t) => t.id === src.id)
        outcome = task ? planTodoDrop(task, target) : null
      }
      if (!outcome || outcome.kind === 'noop') return
      if (outcome.kind === 'refused') say(outcome.line, 'neutral')
      else if (outcome.kind === 'ask') setAsk(outcome)
      else void commit(outcome.plan)
    },
    [canEdit, commit, say],
  )

  // The keyboard is the equal path: Shift with an arrow moves the focused date. Left and Right a day,
  // Up and Down a week on a day grid, or 15 minutes on the time grid.
  const keyTarget = useCallback((kind: DragSource['kind'], id: string, e: KeyboardEvent<HTMLElement>, grid: boolean): DropTarget | null => {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey) return null
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    const vertical = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!step && !vertical) return null
    const cur = latest.current
    const it = kind === 'item' ? cur.items.find((i) => i.id === id) : null
    const tk = kind === 'todo' ? cur.tasks.find((t) => t.id === id) : null
    const day = it?.date ?? tk?.due
    if (!day) return null
    const startMin = it ? it.startMin : (tk?.startMin ?? null)
    if (step) return { zone: 'day', day: addDays(day, step) }
    if (grid && startMin != null && !it?.end) {
      return { zone: 'time', day, startMin: Math.max(0, Math.min(1439 - SNAP_MINUTES, startMin + vertical * SNAP_MINUTES)) }
    }
    return { zone: 'day', day: addDays(day, vertical * 7) }
  }, [])

  const dnd = useSuiteDnd(canEdit, onDrop, keyTarget)

  const onChoose = useCallback(
    (choice: 'thisDate' | 'series' | 'keep') => {
      const pending = ask
      setAsk(null)
      const plan = pending?.choose(choice) ?? null
      if (plan) void commit(plan)
    },
    [ask, commit],
  )
  const dismiss = useCallback(() => setToast(null), [])

  const layer = (
    <>
      {ask ? <SeriesSaveDialog open title={ask.title} plan={ask.series} onChoose={onChoose} /> : null}
      {toast ? (
        <div className="cal-toast" key={toast.id}>
          <Toast
            tone={toast.tone === 'danger' ? 'danger' : toast.tone === 'success' ? 'success' : 'neutral'}
            icon={toast.tone === 'danger' ? <TriangleAlert className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            title={toast.line}
            duration={TOAST_MS}
            onDismiss={dismiss}
            footer={
              toast.undo ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const undo = toast.undo
                    dismiss()
                    undo?.()
                  }}
                >
                  Undo
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}
    </>
  )

  return { data, dnd, layer }
}
