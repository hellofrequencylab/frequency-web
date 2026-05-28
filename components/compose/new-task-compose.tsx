'use client'

import { useState, useTransition } from 'react'
import { Plus, Zap } from 'lucide-react'
import { createCrewTask } from '@/app/(main)/admin/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

const TASK_TYPES = ['attendance', 'hosting', 'volunteering', 'content', 'referral', 'other'] as const
type TaskType = typeof TASK_TYPES[number]

export function NewTaskCompose({
  buttonLabel = 'New Task',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors',
}: {
  buttonLabel?: string
  buttonClass?: string
} = {}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('attendance')
  const [zapsValue, setZapsValue] = useState(10)
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
        <Plus className="w-3.5 h-3.5" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={cmLabel}>Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value as TaskType)}
              disabled={isPending} className={cmInput}>
              {TASK_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className={cmLabel}>Zaps value</label>
            <input type="number" min={1} max={500} value={zapsValue}
              onChange={e => setZapsValue(parseInt(e.target.value) || 10)}
              disabled={isPending} className={cmInput} />
          </div>
        </div>
        <div className="flex items-center gap-4 pt-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={isRepeatable} onChange={e => setIsRepeatable(e.target.checked)}
              disabled={isPending} className="rounded border-gray-300" />
            Repeatable
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={requiresVerification} onChange={e => setRequiresVerification(e.target.checked)}
              disabled={isPending} className="rounded border-gray-300" />
            Requires verification
          </label>
        </div>
      </CreateModal>
    </>
  )
}
