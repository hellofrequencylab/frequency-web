'use client'

import { useId, useState, useTransition } from 'react'
import Image from 'next/image'
import { Pencil, Trash2, Check, X, ShieldCheck, ShieldX } from 'lucide-react'
import { updateCrewTask, deleteCrewTask, approveVerification, rejectVerification } from '../actions'
import { getInitials } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

const TASK_TYPES = [
  'attendance', 'hosting', 'volunteering', 'content', 'referral', 'other',
] as const

type CrewTask = {
  id: string
  name: string
  task_type: string
  zaps_value: number
  is_repeatable: boolean
  requires_verification: boolean
}

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-body-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const label = 'block text-meta font-medium text-muted mb-1'

// The switch takes its name from the label already sitting beside it (`labelId`), so what a
// screen reader says and what a sighted operator reads are the same string and cannot drift.
// `aria-checked` carries the state.
function Toggle({ value, onChange, disabled, labelId }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; labelId: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-labelledby={labelId}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-pill border-2 border-transparent transition-colors disabled:opacity-50 ${value ? 'bg-primary' : 'bg-border-strong'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-pill bg-surface shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

function TaskForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: CrewTask
  onSave: (fd: FormData) => void
  onCancel: () => void
  isPending: boolean
}) {
  // One form can be open per task, so the label ids have to be unique per instance.
  const formId = useId()
  const [name,    setName]    = useState(initial?.name ?? '')
  const [type,    setType]    = useState(initial?.task_type ?? 'attendance')
  const [points,  setPoints]  = useState(String(initial?.zaps_value ?? 10))
  const [repeat,  setRepeat]  = useState(initial?.is_repeatable ?? false)
  const [verify,  setVerify]  = useState(initial?.requires_verification ?? false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('name', name)
    fd.set('task_type', type)
    fd.set('zaps_value', points)
    fd.set('is_repeatable', String(repeat))
    fd.set('requires_verification', String(verify))
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg lift-1">
      <div className="sm:col-span-2">
        <label className={label}>Task name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Attend a ride"
          required
          disabled={isPending}
          className={input}
        />
      </div>

      <div>
        <label className={label} htmlFor={`${formId}-type`}>Type</label>
        <Select id={`${formId}-type`} value={type} onChange={e => setType(e.target.value)} disabled={isPending}>
          {TASK_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </Select>
      </div>

      <div>
        <label className={label}>Zaps</label>
        <input
          type="number"
          min="1"
          max="9999"
          value={points}
          onChange={e => setPoints(e.target.value)}
          required
          disabled={isPending}
          className={input}
        />
      </div>

      <div className="flex items-center gap-3">
        <Toggle value={repeat} onChange={setRepeat} disabled={isPending} labelId={`${formId}-repeatable`} />
        <span id={`${formId}-repeatable`} className="text-body-sm text-text">Repeatable</span>
      </div>

      <div className="flex items-center gap-3">
        <Toggle value={verify} onChange={setVerify} disabled={isPending} labelId={`${formId}-verify`} />
        <span id={`${formId}-verify`} className="text-body-sm text-text">Requires verification</span>
      </div>

      <div className="sm:col-span-2 flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-meta font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create task'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-meta font-medium text-muted hover:bg-surface-elevated transition-colors">
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

type PendingVerification = {
  id: string
  completed_at: string
  zaps_earned: number
  task: { id: string; name: string; zaps_value: number } | null
  member: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

function VerificationQueue({ items }: { items: PendingVerification[] }) {
  const [isPending, startTransition] = useTransition()

  function handleApprove(id: string) {
    startTransition(async () => { await approveVerification(id) })
  }

  function handleReject(id: string) {
    if (!confirm('Reject and delete this completion?')) return
    startTransition(async () => { await rejectVerification(id) })
  }

  if (items.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="text-body-sm font-semibold text-text mb-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        Pending Verification
        <span className="text-meta font-normal text-subtle bg-warning-bg dark:bg-warning-bg text-warning px-1.5 py-0.5 rounded-md">{items.length}</span>
      </h2>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-warning bg-warning-bg/40 dark:bg-warning-bg/20 lift-1 px-4 py-3">
            {c.member?.avatar_url ? (
              <Image src={avatarSrc(c.member.avatar_url)} alt={c.member.display_name} width={28} height={28} className="w-7 h-7 rounded-pill object-cover shrink-0" style={avatarFocusStyle(c.member.avatar_url)} />
            ) : (
              <div className="w-7 h-7 rounded-pill bg-primary-bg text-primary-strong text-meta font-semibold flex items-center justify-center shrink-0">
                {getInitials(c.member?.display_name ?? '?')}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-medium text-text">
                {c.member?.display_name ?? 'Unknown'}
                <span className="text-subtle font-normal"> submitted </span>
                {c.task?.name ?? 'Unknown task'}
              </p>
              <p className="text-meta text-subtle">
                {new Date(c.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}{c.zaps_earned} zaps pending
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handleApprove(c.id)}
                disabled={isPending}
                title="Approve"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-success text-on-success text-meta font-semibold hover:bg-success disabled:opacity-50 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => handleReject(c.id)}
                disabled={isPending}
                title="Reject"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-danger text-danger text-meta font-semibold hover:bg-danger-bg disabled:opacity-50 transition-colors"
              >
                <ShieldX className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CrewTasksClient({ tasks, pendingVerifications = [] }: { tasks: CrewTask[]; pendingVerifications?: PendingVerification[] }) {
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  function handleUpdate(id: string, fd: FormData) {
    startTransition(async () => {
      await updateCrewTask(id, fd)
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this task? Any completions will remain but the task will be removed.')) return
    startTransition(async () => {
      await deleteCrewTask(id)
    })
  }

  return (
    <div className="space-y-3">
      <VerificationQueue items={pendingVerifications} />

      {/* Task list */}
      {tasks.length === 0 && (
        <p className="text-body-sm text-subtle py-6 text-center">No crew tasks yet.</p>
      )}

      {tasks.map((task) => (
        <div key={task.id}>
          {editingId === task.id ? (
            <TaskForm
              initial={task}
              onSave={(fd) => handleUpdate(task.id, fd)}
              onCancel={() => setEditingId(null)}
              isPending={isPending}
            />
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface lift-1 px-4 py-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-body-sm font-medium text-text">{task.name}</span>
                  <span className="text-meta px-1.5 py-0.5 rounded-md bg-primary-bg text-primary-strong font-medium capitalize">
                    {task.task_type}
                  </span>
                  {task.is_repeatable && (
                    <span className="text-meta px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
                      Repeatable
                    </span>
                  )}
                  {task.requires_verification && (
                    <span className="text-meta px-1.5 py-0.5 rounded-md bg-warning-bg dark:bg-warning-bg text-warning font-medium">
                      Needs verification
                    </span>
                  )}
                </div>
              </div>

              <span className="text-body-sm font-bold text-primary-strong shrink-0">
                +{task.zaps_value} zaps
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingId(task.id)}
                  className="p-1.5 rounded-lg text-subtle hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors"
                  aria-label="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  disabled={isPending}
                  className="p-1.5 rounded-lg text-subtle hover:text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
