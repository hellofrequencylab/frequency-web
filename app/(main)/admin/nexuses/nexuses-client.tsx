'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { updateNexus } from '../actions'
import { Button } from '@/components/ui/button'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'

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
const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl   = 'block text-xs font-medium text-muted mb-1'

// The one status vocabulary (retired the local STATUS_COLOR dict, ADR-233 §4).
const STATUS_TONE: Record<string, StatusTone> = {
  forming: 'info',
  active: 'success',
  paused: 'warning',
  archived: 'neutral',
}

function NexusForm({ initial, mentors, onSave, onCancel, isPending, error }: {
  initial?:  NexusRow
  mentors:   MentorOption[]
  onSave:    (fd: FormData) => void
  onCancel:  () => void
  isPending: boolean
  error:     string | null
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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <option value="">- Assign later -</option>
            {mentors.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
          <Check className="h-3.5 w-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create nexus'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isPending}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-danger sm:col-span-2">{error}</p>}
    </form>
  )
}

export function NexusesClient({ nexuses, mentors, initialEditId = null }: { nexuses: NexusRow[]; mentors: MentorOption[]; initialEditId?: string | null }) {
  // Honor a ?edit=<id> deep-link (the "Edit nexus" button on the nexus page).
  const [editingId,  setEditingId]   = useState<string | null>(
    initialEditId && nexuses.some((n) => n.id === initialEditId) ? initialEditId : null,
  )
  // updateNexus throws on failure; catch it so a failed save shows a reason instead
  // of silently closing the editor as if it worked.
  const [error, setError] = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  const columns: ColumnDef<NexusRow>[] = [
    {
      key: 'name',
      header: 'Nexus',
      render: (n) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text">{n.name}</span>
          <StatusChip tone={STATUS_TONE[n.status] ?? 'info'} size="sm">
            <span className="capitalize">{n.status}</span>
          </StatusChip>
        </span>
      ),
    },
    {
      key: 'hubs',
      header: 'Hubs',
      type: 'number',
      render: (n) => <span className="tabular-nums">{n._hub_count}</span>,
    },
    {
      key: 'cap',
      header: 'Cap',
      type: 'number',
      render: (n) => <span className="tabular-nums">{n.member_cap}</span>,
    },
    { key: 'mentor', header: 'Mentor', render: (n) => n.mentor?.display_name ?? <span className="text-subtle">—</span> },
  ]

  return (
    <div>
      <DataTable
        caption="Nexuses"
        rows={nexuses}
        getRowId={(n) => n.id}
        columns={columns}
        expandedRowId={editingId ?? undefined}
        expandedRow={(n) => (
          <NexusForm
            initial={n}
            mentors={mentors}
            onSave={(fd) => {
              setError(null)
              startTransition(async () => {
                try {
                  await updateNexus(n.id, fd)
                  setEditingId(null)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not save the nexus.')
                }
              })
            }}
            onCancel={() => { setError(null); setEditingId(null) }}
            isPending={isPending}
            error={error}
          />
        )}
        rowActions={(n) => (
          <button onClick={() => setEditingId(n.id)} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-primary-bg hover:text-primary-strong motion-reduce:transition-none" aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        empty={
          <EmptyState
            variant="first-use"
            title="No nexuses yet"
            description="Nexuses are the top-level grouping. Create one and assign a mentor to oversee its hubs and circles."
          />
        }
      />
    </div>
  )
}
