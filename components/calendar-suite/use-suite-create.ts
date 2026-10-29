import { useCallback, useEffect, useRef } from 'react'
import type { ActionResult } from '@/lib/action-result'
import { monthDayLabel } from '@/lib/calendar/planner/days'
import { pencilDoneLine, type QuickKind } from '@/lib/calendar/planner/pencil-it-in'
import type { PencilSubmit } from './suite-pencil'

// MAKING THINGS FROM THE CALENDAR: Pencil it in, quick add and the command bar's create row all end
// here. Each calls the server action, says what happened in the toast with an Undo where there is
// something to take back, and hands the caller a sentence only when it failed (so a sheet can stay
// open with its words). The writes are passed in so a test stands in for them.

type Say = (line: string, tone: 'success' | 'danger' | 'neutral', undo?: (() => void) | null) => void

type QuickMade = { kind: 'plan' | 'entry' | 'todo'; id: string; line: string }

export interface SuiteCreateActions {
  pencilItIn: (input: PencilSubmit) => Promise<ActionResult<{ planId: string; todos: number; holdUntil: string | null }>>
  addQuick: (input: { kind: QuickKind; title: string; day: string | null; startMin: number | null; durMin?: number }) => Promise<ActionResult<QuickMade>>
  /** Puts away a Plan and the dates it holds. */
  removePlan: (planId: string) => Promise<ActionResult<void>>
  removeEntry: (entryId: string) => Promise<ActionResult<void>>
}

export function useSuiteCreate(actions: SuiteCreateActions, say: Say) {
  const ref = useRef(actions)
  useEffect(() => {
    ref.current = actions
  })

  const undoWith = useCallback(
    (run: () => Promise<ActionResult<void>>) => async () => {
      const res = await run()
      if ('error' in res) say(`Could not undo that. ${res.error}`, 'danger')
      else say('Taken back.', 'neutral')
    },
    [say],
  )

  const pencil = useCallback(
    async (input: PencilSubmit): Promise<string | null> => {
      const res = await ref.current.pencilItIn(input)
      if ('error' in res) return res.error
      const { planId, holdUntil } = res.data
      say(pencilDoneLine(input.dates.length, holdUntil ? monthDayLabel(holdUntil) : null), 'success', undoWith(() => ref.current.removePlan(planId)))
      return null
    },
    [say, undoWith],
  )

  const quick = useCallback(
    async (input: { kind: QuickKind; title: string; day: string | null; startMin: number | null; durMin?: number }): Promise<string | null> => {
      const res = await ref.current.addQuick(input)
      if ('error' in res) return res.error
      const made = res.data
      const undo =
        made.kind === 'plan'
          ? undoWith(() => ref.current.removePlan(made.id))
          : made.kind === 'entry'
            ? undoWith(() => ref.current.removeEntry(made.id))
            : null
      say(input.day ? `${made.line.replace(/\.$/, '')} on ${monthDayLabel(input.day)}.` : made.line, 'success', undo)
      return null
    },
    [say, undoWith],
  )

  return { pencil, quick }
}
