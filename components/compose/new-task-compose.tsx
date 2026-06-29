'use client'

import { useState, useTransition } from 'react'
import { Plus, Zap } from 'lucide-react'
import { createCrewTask } from '@/app/(main)/admin/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'
import { TIER_ORDER, TIER_ZAPS, TIER_LABELS } from '@/lib/practices/tiers'

const TASK_TYPES = ['attendance', 'hosting', 'volunteering', 'content', 'referral', 'other'] as const
type TaskType = typeof TASK_TYPES[number]

export function NewTaskCompose({
  buttonLabel = 'New Task',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  buttonLabel?: string
  buttonClass?: string
} = {}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('attendance')
  const [zapsValue, setZapsValue] = useState(TIER_ZAPS.standard)
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [requiresVerification, setRequiresVerification] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('task_type', taskType)
    fd.set('zaps_value', String(zapsValue))
    fd.set('is_repeatable', String(isRepeatable))
    fd.set('requires_verification', String(requiresVerification))

    startTransition(async () => {
      try {
        await createCrewTask(fd)
        setOpen(false)
        setName('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task.')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title="New Crew Task" titleIcon={Zap} titleIconColor="amber"
        submitLabel="Create Task" pendingLabel="Creating…"
        submitDisabled={!name.trim()} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Task name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Attend a circle event" required disabled={isPending} className={cmInput} />
        </div>
        <div>
          <label className={cmLabel}>Type</label>
          <select value={taskType} onChange={e => setTaskType(e.target.value as TaskType)}
            disabled={isPending} className={cmInput}>
            {TASK_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          {/* Effort tier (ADR-442): a constrained Light/Standard/Heavy range, never a free
              number, so a task can't be set to an unlimited reward. */}
          <label className={cmLabel}>Effort</label>
          <div role="radiogroup" aria-label="Effort" className="grid grid-cols-3 gap-2">
            {TIER_ORDER.map(t => {
              const zaps = TIER_ZAPS[t]
              const active = zapsValue === zaps
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isPending}
                  onClick={() => setZapsValue(zaps)}
                  className={`flex min-h-10 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary-bg text-primary-strong'
                      : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text'
                  }`}
                >
                  <span>{TIER_LABELS[t]}</span>
                  <span className={`text-2xs font-semibold ${active ? 'text-primary-strong' : 'text-subtle'}`}>{zaps} Zaps</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-4 pt-2">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={isRepeatable} onChange={e => setIsRepeatable(e.target.checked)}
              disabled={isPending} className="rounded border-border-strong" />
            Repeatable
          </label>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={requiresVerification} onChange={e => setRequiresVerification(e.target.checked)}
              disabled={isPending} className="rounded border-border-strong" />
            Requires verification
          </label>
        </div>
      </CreateModal>
    </>
  )
}
