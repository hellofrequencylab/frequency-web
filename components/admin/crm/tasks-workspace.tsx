'use client'

// The Resonance CRM Tasks workspace (ADR-628): the operator follow-up board. A filter row
// (mine / all / overdue), a quick create form, and per-task complete / snooze / reopen. All mutations
// go through the staff-gated server actions; the list refreshes on success. Types are imported
// TYPE-ONLY from lib/crm/tasks (the module also holds the service-role IO, which must never reach the
// client bundle), and the tiny filter is inlined here for the same reason.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Plus, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, fieldClasses } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import type { CrmTask } from '@/lib/crm/tasks'
import { createTaskAction, setTaskStatusAction } from '@/app/(main)/admin/crm/tasks/actions'

type Tab = 'mine' | 'all' | 'overdue'

const TABS: { key: Tab; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'all', label: 'All' },
]

function overdue(t: CrmTask, now: number): boolean {
  return t.status === 'open' && !!t.dueAt && Date.parse(t.dueAt) < now
}

function dueLabel(t: CrmTask, now: number): string | null {
  if (!t.dueAt) return null
  const due = Date.parse(t.dueAt)
  if (Number.isNaN(due)) return null
  const d = new Date(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return overdue(t, now) ? `Overdue: ${d}` : `Due ${d}`
}

export function TasksWorkspace({ tasks, viewerId }: { tasks: CrmTask[]; viewerId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('mine')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Lazy state init keeps `now` stable across renders (a bare Date.now() in render is impure).
  const [now] = useState(() => Date.now())

  const visible = useMemo(() => {
    const list = tasks.filter((t) => {
      if (tab === 'mine') return t.assigneeProfileId === viewerId && t.status !== 'done'
      if (tab === 'overdue') return overdue(t, now)
      return true
    })
    const rank: Record<CrmTask['status'], number> = { open: 0, snoozed: 1, done: 2 }
    return [...list].sort((a, b) => {
      const sr = rank[a.status] - rank[b.status]
      if (sr !== 0) return sr
      const da = a.dueAt ? Date.parse(a.dueAt) : Infinity
      const db = b.dueAt ? Date.parse(b.dueAt) : Infinity
      return da - db
    })
  }, [tasks, tab, viewerId, now])

  function setStatus(id: string, status: CrmTask['status'], dueAt?: string | null) {
    setError(null)
    start(async () => {
      const res = await setTaskStatusAction(id, status, dueAt ? { dueAt } : undefined)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <TaskCreateForm
        pending={pending}
        onError={setError}
        onCreated={() => router.refresh()}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              tab === t.key ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing here"
          description={tab === 'mine' ? 'You have no open follow-ups. Add one above.' : 'No tasks match this filter.'}
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="min-w-0">
                <p className={`text-sm font-medium ${t.status === 'done' ? 'text-muted line-through' : 'text-text'}`}>
                  {t.title}
                </p>
                {t.notes && <p className="mt-0.5 truncate text-xs text-muted">{t.notes}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted">
                  {dueLabel(t, now) && (
                    <span className={overdue(t, now) ? 'text-danger' : ''}>{dueLabel(t, now)}</span>
                  )}
                  {t.status === 'snoozed' && <span>Snoozed</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {t.status !== 'done' ? (
                  <>
                    <button
                      type="button"
                      title="Snooze a week"
                      disabled={pending}
                      onClick={() =>
                        setStatus(t.id, 'snoozed', new Date(now + 7 * 86_400_000).toISOString())
                      }
                      className="rounded-md p-1.5 text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-50"
                    >
                      <Clock className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Mark done"
                      disabled={pending}
                      onClick={() => setStatus(t.id, 'done')}
                      className="rounded-md p-1.5 text-muted hover:bg-success-bg hover:text-success disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    title="Reopen"
                    disabled={pending}
                    onClick={() => setStatus(t.id, 'open')}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-50"
                  >
                    <RotateCcw className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskCreateForm({
  pending,
  onError,
  onCreated,
}: {
  pending: boolean
  onError: (msg: string | null) => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, start] = useTransition()

  function submit() {
    const t = title.trim()
    if (!t) {
      onError('Give the task a title first.')
      return
    }
    onError(null)
    start(async () => {
      const res = await createTaskAction({
        title: t,
        notes: notes.trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      })
      if (isError(res)) {
        onError(res.error)
        return
      }
      setTitle('')
      setDueAt('')
      setNotes('')
      setOpen(false)
      onCreated()
    })
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 size-4" /> New task
      </Button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!saving && !pending) submit()
      }}
      className="space-y-2 rounded-lg border border-border bg-surface p-3"
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing? (e.g. Call Ada back)"
        aria-label="Task title"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          aria-label="Due date"
          className={fieldClasses}
        />
      </div>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        aria-label="Notes"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || pending}>
          {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null} Add task
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
