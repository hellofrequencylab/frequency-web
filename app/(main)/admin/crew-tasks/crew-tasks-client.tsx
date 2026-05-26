'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { createCrewTask, updateCrewTask, deleteCrewTask } from '../actions'

const TASK_TYPES = [
  'attendance', 'hosting', 'volunteering', 'content', 'referral', 'other',
] as const

type CrewTask = {
  id: string
  name: string
  task_type: string
  points_value: number
  is_repeatable: boolean
  requires_verification: boolean
}

const input = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50 placeholder:text-gray-400'
const select = input
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${value ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
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
  const [name,    setName]    = useState(initial?.name ?? '')
  const [type,    setType]    = useState(initial?.task_type ?? 'attendance')
  const [points,  setPoints]  = useState(String(initial?.points_value ?? 10))
  const [repeat,  setRepeat]  = useState(initial?.is_repeatable ?? false)
  const [verify,  setVerify]  = useState(initial?.requires_verification ?? false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('name', name)
    fd.set('task_type', type)
    fd.set('points_value', points)
    fd.set('is_repeatable', String(repeat))
    fd.set('requires_verification', String(verify))
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20">
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
        <label className={label}>Type</label>
        <select value={type} onChange={e => setType(e.target.value)} disabled={isPending} className={select}>
          {TASK_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Points</label>
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
        <Toggle value={repeat} onChange={setRepeat} disabled={isPending} />
        <span className="text-sm text-gray-700 dark:text-gray-300">Repeatable</span>
      </div>

      <div className="flex items-center gap-3">
        <Toggle value={verify} onChange={setVerify} disabled={isPending} />
        <span className="text-sm text-gray-700 dark:text-gray-300">Requires verification</span>
      </div>

      <div className="sm:col-span-2 flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create task'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

export function CrewTasksClient({ tasks }: { tasks: CrewTask[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  function handleCreate(fd: FormData) {
    startTransition(async () => {
      await createCrewTask(fd)
      setShowCreate(false)
    })
  }

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
      {/* Create form / button */}
      {showCreate ? (
        <TaskForm
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          isPending={isPending}
        />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New task
        </button>
      )}

      {/* Task list */}
      {tasks.length === 0 && !showCreate && (
        <p className="text-sm text-gray-400 py-6 text-center">No crew tasks yet — create one above.</p>
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
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{task.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium capitalize">
                    {task.task_type}
                  </span>
                  {task.is_repeatable && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                      Repeatable
                    </span>
                  )}
                  {task.requires_verification && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium">
                      Needs verification
                    </span>
                  )}
                </div>
              </div>

              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                +{task.points_value} pts
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingId(task.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                  aria-label="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  disabled={isPending}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
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
