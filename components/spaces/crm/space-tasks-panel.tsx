'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ListChecks, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, fieldClasses } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { isError } from '@/lib/action-result'
import { createTask, updateTask, setTaskDone, deleteTask } from '@/lib/crm/space-tasks-actions'
import type { SpaceTask } from '@/lib/crm/pipeline'

// PER-SPACE TASKS PANEL (client, CRM-STRATEGY §6/§7). The interactive surface for a Space's CRM tasks:
// create (title, optional due date, optional deal/contact link), edit a title/due date inline, mark
// complete / reopen, and delete. Tasks are read + partitioned server-side and passed in; every write
// re-checks authorization + space scope server-side (lib/crm/space-tasks.ts), so this form is
// convenience, not the gate. readOnly hides every write affordance (a staff preview).
//
// Plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).

type LinkOption = { id: string; label: string }

const dueFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** A due date's tone relative to today: overdue (past), soon (within 3 days), or later. Pure-ish (reads
 *  the clock once per render). Drives the chip color via semantic tokens only. */
function dueTone(dueAt: string | null): 'overdue' | 'soon' | 'later' | null {
  if (!dueAt) return null
  const due = Date.parse(dueAt)
  if (Number.isNaN(due)) return null
  const now = Date.now()
  const days = (due - now) / 86_400_000
  if (days < 0) return 'overdue'
  if (days <= 3) return 'soon'
  return 'later'
}

export function SpaceTasksPanel({
  spaceId,
  slug,
  open,
  done,
  dealOptions,
  contactOptions,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  open: SpaceTask[]
  done: SpaceTask[]
  dealOptions: LinkOption[]
  contactOptions: LinkOption[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [showDone, setShowDone] = useState(false)

  // Create-form state.
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [linkTo, setLinkTo] = useState('') // "deal:<id>" | "contact:<id>" | ""

  // Inline edit state (one task at a time).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')

  function resolveLink(value: string): { dealId: string | null; contactId: string | null } {
    if (value.startsWith('deal:')) return { dealId: value.slice('deal:'.length), contactId: null }
    if (value.startsWith('contact:')) return { dealId: null, contactId: value.slice('contact:'.length) }
    return { dealId: null, contactId: null }
  }

  function add() {
    setError(null)
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Write a task first.')
      return
    }
    const link = resolveLink(linkTo)
    start(async () => {
      const result = await createTask(
        spaceId,
        { title: trimmed, dueAt: dueAt || null, dealId: link.dealId, contactId: link.contactId },
        slug,
      )
      if (isError(result)) {
        setError(result.error)
        return
      }
      setTitle('')
      setDueAt('')
      setLinkTo('')
      router.refresh()
    })
  }

  function beginEdit(task: SpaceTask) {
    setError(null)
    setEditingId(task.id)
    setEditTitle(task.title)
    // A datetime value renders to a yyyy-mm-dd input; take the date part only.
    setEditDue(task.due_at ? task.due_at.slice(0, 10) : '')
  }

  function saveEdit(taskId: string) {
    setError(null)
    const trimmed = editTitle.trim()
    if (!trimmed) {
      setError('A task needs a title.')
      return
    }
    start(async () => {
      const result = await updateTask(spaceId, taskId, { title: trimmed, dueAt: editDue || null }, slug)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setEditingId(null)
      router.refresh()
    })
  }

  function toggle(taskId: string, makeDone: boolean) {
    setError(null)
    start(async () => {
      const result = await setTaskDone(spaceId, taskId, makeDone, slug)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function remove(taskId: string) {
    setError(null)
    start(async () => {
      const result = await deleteTask(spaceId, taskId, slug)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section>
      <SectionHeader title="Tasks" count={open.length} />

      {!readOnly && (
        <form
          className="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            if (!pending) add()
          }}
        >
          <div className="grid gap-3 @lg:grid-cols-[1fr_auto_auto]">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              maxLength={280}
              aria-label="Task title"
            />
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              aria-label="Due date (optional)"
              className="@lg:w-44"
            />
            <select
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              aria-label="Link to a deal or contact (optional)"
              className={`${fieldClasses} @lg:w-52`}
            >
              <option value="">No link</option>
              {dealOptions.length > 0 && (
                <optgroup label="Deals">
                  {dealOptions.map((d) => (
                    <option key={`deal:${d.id}`} value={`deal:${d.id}`}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {contactOptions.length > 0 && (
                <optgroup label="Contacts">
                  {contactOptions.map((c) => (
                    <option key={`contact:${c.id}`} value={`contact:${c.id}`}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden /> Add task
                </>
              )}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {open.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No open tasks."
          description="Tasks you add for this space show here, due soonest first."
        />
      ) : (
        <ul className="space-y-2">
          {open.map((task) => (
            <li key={task.id} className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
              {editingId === task.id ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={280}
                    aria-label="Task title"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      value={editDue}
                      onChange={(e) => setEditDue(e.target.value)}
                      aria-label="Due date (optional)"
                      className="w-44"
                    />
                    <Button type="button" size="sm" disabled={pending} onClick={() => saveEdit(task.id)}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => toggle(task.id, true)}
                      disabled={pending}
                      aria-label="Mark task complete"
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border text-transparent transition-colors hover:border-success hover:text-success disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => !readOnly && beginEdit(task)}
                      disabled={readOnly}
                      className="block w-full text-left text-sm font-medium text-text disabled:cursor-default"
                    >
                      {task.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <DueChip dueAt={task.due_at} />
                      {task.linkLabel && (
                        <span className="truncate text-xs text-subtle">{task.linkLabel}</span>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => remove(task.id)}
                      disabled={pending}
                      aria-label="Delete task"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs font-medium text-muted transition-colors hover:text-text"
            aria-expanded={showDone}
          >
            {showDone ? 'Hide' : 'Show'} completed ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 space-y-2">
              {done.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface-elevated/40 p-3"
                >
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-success-bg text-success"
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted line-through">{task.title}</p>
                    {task.linkLabel && <p className="mt-0.5 truncate text-xs text-subtle">{task.linkLabel}</p>}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => toggle(task.id, false)}
                      disabled={pending}
                      aria-label="Reopen task"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function DueChip({ dueAt }: { dueAt: string | null }) {
  const tone = dueTone(dueAt)
  if (!dueAt || !tone) return <span className="text-xs text-subtle">No due date</span>
  const label = dueFmt.format(new Date(dueAt))
  const cls =
    tone === 'overdue'
      ? 'bg-danger-bg text-danger'
      : tone === 'soon'
        ? 'bg-warning-bg text-warning'
        : 'bg-surface-elevated text-muted'
  const prefix = tone === 'overdue' ? 'Overdue ' : 'Due '
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {prefix}
      {label}
    </span>
  )
}
