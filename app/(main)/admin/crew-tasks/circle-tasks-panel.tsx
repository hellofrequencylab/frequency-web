'use client'

// Host flow for circle-task assignment (BUILD-LIST P4.7): create a task scoped
// to a circle you host, see who claimed what, release a stalled claim, or
// remove a task. Server actions re-check circle.assignTask on every write —
// this panel is affordance only.

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Check, Hand, Plus, Trash2, Undo2, X } from 'lucide-react'
import { createCircleTask, deleteCircleTask, releaseCircleTask } from '../../crew/circle-task-actions'
import type { CircleTask } from '@/lib/crew/circle-tasks'
import { getInitials } from '@/lib/utils'

const TASK_TYPES = [
  'attendance', 'hosting', 'volunteering', 'content', 'referral', 'other',
] as const

export interface HostedCircleTasks {
  id: string
  name: string
  tasks: CircleTask[]
}

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const label = 'block text-xs font-medium text-muted mb-1'

function NewCircleTaskForm({
  circleId,
  onDone,
}: {
  circleId: string
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName]     = useState('')
  const [type, setType]     = useState<string>('volunteering')
  const [zaps, setZaps]     = useState('10')
  const [verify, setVerify] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('name', name)
    fd.set('task_type', type)
    fd.set('zaps_value', zaps)
    fd.set('requires_verification', String(verify))
    startTransition(async () => {
      const res = await createCircleTask(circleId, fd)
      if (!res.ok) { setError(res.error ?? 'Could not create the task.'); return }
      onDone()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg shadow-sm">
      <div className="sm:col-span-2">
        <label className={label}>Task name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bring the speaker to Saturday's ride"
          required
          disabled={isPending}
          className={input}
        />
      </div>

      <div>
        <label className={label}>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} disabled={isPending} className={input}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Zaps</label>
        <input
          type="number"
          min="1"
          max="9999"
          value={zaps}
          onChange={(e) => setZaps(e.target.value)}
          required
          disabled={isPending}
          className={input}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={verify}
          onChange={(e) => setVerify(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 rounded border-border accent-current"
        />
        Requires verification
      </label>

      <div className="sm:col-span-2 flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Creating…' : 'Create task'}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  )
}

function CircleTaskRow({ task }: { task: CircleTask }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRelease() {
    setError(null)
    startTransition(async () => {
      const res = await releaseCircleTask(task.id)
      if (!res.ok && res.error) setError(res.error)
    })
  }

  function handleDelete() {
    if (!confirm('Remove this circle task?')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCircleTask(task.id)
      if (!res.ok && res.error) setError(res.error)
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface shadow-sm px-4 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text">{task.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary-bg text-primary-strong font-medium capitalize">
            {task.taskType}
          </span>
          {task.requiresVerification && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-bg text-warning font-medium">
              Needs verification
            </span>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
          {task.assignee ? (
            <>
              {task.assignee.avatarUrl ? (
                <Image src={task.assignee.avatarUrl} alt={task.assignee.displayName} width={16} height={16} className="w-4 h-4 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                  {getInitials(task.assignee.displayName)}
                </span>
              )}
              Claimed by {task.assignee.displayName}
              {task.claimedAt && <> · {new Date(task.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
            </>
          ) : (
            <><Hand className="w-3 h-3" /> Open — waiting for a member to claim it</>
          )}
          {error && <span className="text-danger">{error}</span>}
        </p>
      </div>

      <span className="text-sm font-bold text-primary-strong shrink-0">+{task.zapsValue} zaps</span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.assignedTo && (
          <button
            onClick={handleRelease}
            disabled={isPending}
            title="Release claim"
            className="p-1.5 rounded-lg text-subtle hover:text-primary-strong hover:bg-primary-bg disabled:opacity-50 transition-colors"
            aria-label="Release claim"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={isPending}
          title="Delete task"
          className="p-1.5 rounded-lg text-subtle hover:text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors"
          aria-label="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function CircleTasksPanel({ circles }: { circles: HostedCircleTasks[] }) {
  const [composingFor, setComposingFor] = useState<string | null>(null)

  if (circles.length === 0) return null

  return (
    <div className="space-y-6">
      {circles.map((circle) => (
        <section key={circle.id}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text">
              {circle.name}
              <span className="ml-2 text-xs font-normal text-subtle">{circle.tasks.length} task{circle.tasks.length === 1 ? '' : 's'}</span>
            </h3>
            {composingFor !== circle.id && (
              <button
                onClick={() => setComposingFor(circle.id)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New circle task
              </button>
            )}
          </div>

          <div className="space-y-2">
            {composingFor === circle.id && (
              <NewCircleTaskForm circleId={circle.id} onDone={() => setComposingFor(null)} />
            )}
            {circle.tasks.length === 0 && composingFor !== circle.id && (
              <p className="text-sm text-subtle rounded-2xl border border-dashed border-border px-4 py-4 text-center">
                No tasks yet. Create one and a Crew member of this circle can claim it.
              </p>
            )}
            {circle.tasks.map((task) => (
              <CircleTaskRow key={task.id} task={task} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
