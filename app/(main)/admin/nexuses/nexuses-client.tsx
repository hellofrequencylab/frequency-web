'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Check, X } from 'lucide-react'
import { createNexus, updateNexus } from '../actions'

type NexusRow = {
  id: string
  name: string
  status: string
  member_cap: number
  mentor_id: string | null
  mentor: { id: string; display_name: string } | null
  _hub_count: number
}

type MentorOption = { id: string; display_name: string }

const STATUSES = ['forming', 'active', 'paused', 'archived'] as const
const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 dark:focus:ring-primary/30 disabled:opacity-50 placeholder:text-subtle'
const lbl   = 'block text-xs font-medium text-muted mb-1'

const STATUS_COLOR: Record<string, string> = {
  forming:  'bg-signal-bg text-signal-strong',
  active:   'bg-success-bg text-success dark:bg-success-bg',
  paused:   'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  archived: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
}

function NexusForm({ initial, mentors, onSave, onCancel, isPending }: {
  initial?:  NexusRow
  mentors:   MentorOption[]
  onSave:    (fd: FormData) => void
  onCancel:  () => void
  isPending: boolean
}) {
  const [name,     setName]     = useState(initial?.name ?? '')
  const [cap,      setCap]      = useState(String(initial?.member_cap ?? 100))
  const [mentorId, setMentorId] = useState(initial?.mentor_id ?? '')
  const [status,   setStatus]   = useState(initial?.status ?? 'forming')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('name', name)
    fd.set('member_cap', cap)
    fd.set('mentor_id', mentorId)
    fd.set('status', status)
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg mb-4">
      <div className="sm:col-span-2">
        <label className={lbl}>Nexus name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. San Diego Nexus" required disabled={isPending} className={input} />
      </div>
      <div>
        <label className={lbl}>Member cap</label>
        <input type="number" min="1" max="9999" value={cap} onChange={e => setCap(e.target.value)} disabled={isPending} className={input} />
      </div>
      <div>
        <label className={lbl}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} disabled={isPending} className={input}>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      {mentors.length > 0 && (
        <div>
          <label className={lbl}>Mentor</label>
          <select value={mentorId} onChange={e => setMentorId(e.target.value)} disabled={isPending} className={input}>
            <option value="">— Assign later —</option>
            {mentors.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </div>
      )}
      <div className="sm:col-span-2 flex items-center gap-2 pt-1">
        <button type="submit" disabled={!name.trim() || isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-40 transition-colors">
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create nexus'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors">
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

export function NexusesClient({ nexuses, mentors }: { nexuses: NexusRow[]; mentors: MentorOption[] }) {
  const [editingId,  setEditingId]   = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  return (
    <div>
      <div className="space-y-2">
        {nexuses.length === 0 && (
          <p className="text-sm text-subtle py-6 text-center">No nexuses yet.</p>
        )}
        {nexuses.map(nexus => (
          <div key={nexus.id}>
            {editingId === nexus.id ? (
              <NexusForm
                initial={nexus}
                mentors={mentors}
                onSave={(fd) => { startTransition(async () => { await updateNexus(nexus.id, fd); setEditingId(null) }) }}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text">{nexus.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${STATUS_COLOR[nexus.status] ?? STATUS_COLOR.forming}`}>{nexus.status}</span>
                  </div>
                  <p className="text-xs text-subtle mt-0.5">
                    {nexus._hub_count} hub{nexus._hub_count !== 1 ? 's' : ''} · cap {nexus.member_cap}
                    {nexus.mentor && ` · Mentor: ${nexus.mentor.display_name}`}
                  </p>
                </div>
                <button onClick={() => setEditingId(nexus.id)} className="p-1.5 rounded-lg text-subtle opacity-0 group-hover:opacity-100 hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg transition-all" aria-label="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
