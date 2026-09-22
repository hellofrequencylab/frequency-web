'use client'

import { useState, useTransition } from 'react'
import { AlarmClock, CheckSquare, ListTodo } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { isError } from '@/lib/action-result'
import {
  filterTasks,
  isOverdue,
  sortTasks,
  summarizeTasks,
  TASK_FILTERS,
  type CrmTask,
  type TaskFilter,
} from '@/lib/crm/tasks-core'
import { describeOffset } from '@/lib/calendar/relative-schedule'
import { setSpaceTaskDone } from './task-actions'

// THE SPACE TO-DO INBOX, client half (PROG-CAL4 "My tasks").
//
// One list for Plan to-dos and CRM follow-ups, because they are the same crm_tasks rows
// (ADR-1386 owner ruling 3: one team task inbox, not a second task system). The filtering and
// ordering are `filterTasks` and `sortTasks` from lib/crm/tasks.ts, NOT a second implementation:
// this panel exists because those had one caller and it was platform-staff-only.
//
// `by-contact` and `by-plan` are deliberately not offered here. Both need an id this panel has no
// picker for, and filterTasks answers [] without one, so a chip for either would read as "no
// to-dos" rather than "nothing selected". A Plan's own to-dos are already in its drawer.
const VISIBLE_FILTERS = TASK_FILTERS.filter((f) => f !== 'by-contact' && f !== 'by-plan')

const FILTER_LABEL: Record<string, string> = { all: 'All', mine: 'Mine', overdue: 'Overdue' }

export function SpaceTodosPanel({
  slug,
  tasks,
  viewerId,
}: {
  slug: string
  tasks: CrmTask[]
  viewerId: string | null
}) {
  const [pending, start] = useTransition()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [rows, setRows] = useState<CrmTask[]>(tasks)
  const [error, setError] = useState<string | null>(null)

  const [syncedTasks, setSyncedTasks] = useState(tasks)
  if (tasks !== syncedTasks) {
    setSyncedTasks(tasks)
    setRows(tasks)
  }

  const counts = summarizeTasks(rows)
  const shown = sortTasks(filterTasks(rows, filter, { viewerId }))

  const toggle = (taskId: string, done: boolean) => {
    setError(null)
    setRows((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: done ? 'done' : 'open' } : t)))
    start(async () => {
      const res = await setSpaceTaskDone(slug, taskId, done)
      if (isError(res)) {
        setError(res.error)
        // Put the row back: the checkbox must never claim a write that did not land.
        setRows((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: done ? 'open' : 'done' } : t)))
      }
    })
  }

  return (
    <div className="space-y-3 pt-2" data-space-todos-panel>
      <SectionHeader title="To-dos" count={counts.open} />
      <p className="text-body-sm text-muted">
        Everything your team owes this Space, in one place. Plan to-dos and follow-ups live on the
        same list.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Open" value={counts.open} icon={ListTodo} bordered size="sm" />
        <StatCard label="Overdue" value={counts.overdue} icon={AlarmClock} bordered size="sm" />
        <StatCard label="Done" value={counts.done} icon={CheckSquare} bordered size="sm" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={ListTodo}
          title="No to-dos yet."
          description="Open a Plan and add what has to happen before the date. Anything you add there shows up here."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter to-dos">
            {VISIBLE_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                // 🔴 THE SELECTED STATE DELIBERATELY SPENDS NO BRAND FILL, for two reasons that
                // point the same way. check:adoption's `raw-button-bg` pattern matches a raw
                // button opening tag carrying a brand-fill class, so a brand-filled chip here
                // would book three fresh hits against a RATCHETED class — HYG-105 already
                // banked a 403→404 raise for the two calendar view switchers and stays
                // flagged until a sweep. And
                // ADR-1503 settled the principle on the stage palette next door: the brand accent
                // is one chrome accent, not a state, and a state is never a hue alone. So this
                // reads as selected by its EDGE, its ground and its weight, with aria-pressed
                // carrying it for anyone not seeing colour at all.
                className={
                  filter === f
                    ? 'rounded-control border border-border-strong bg-surface-elevated px-3 py-1 text-body-sm font-semibold text-text'
                    : 'rounded-control border border-border px-3 py-1 text-body-sm font-medium text-muted hover:border-border-strong hover:text-text'
                }
              >
                {FILTER_LABEL[f] ?? f}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="text-body-sm text-muted">
              {filter === 'mine'
                ? 'Nothing is assigned to you right now.'
                : filter === 'overdue'
                  ? 'Nothing is overdue.'
                  : 'Nothing here yet.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {shown.map((t) => {
                const anchor = describeOffset(t.dueOffsetDays)
                const late = isOverdue(t)
                return (
                  <li key={t.id}>
                    <Checkbox
                      checked={t.status === 'done'}
                      disabled={pending}
                      onChange={(e) => toggle(t.id, e.target.checked)}
                      label={
                        <span className={t.status === 'done' ? 'text-muted line-through' : undefined}>
                          {t.title}
                          {t.dueAt ? ` · ${t.dueAt.slice(0, 10)}` : ''}
                          {anchor ? <span className="text-muted">{` · ${anchor} the date`}</span> : null}
                          {late ? <span className="font-semibold text-danger"> · Overdue</span> : null}
                        </span>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
