'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { updateHub } from '../actions'
import { Button } from '@/components/ui/button'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'

type HubRow = {
  id: string
  name: string
  status: string
  nexus_id: string | null
  guide_id: string | null
  nexus: { id: string; name: string } | null
  guide: { id: string; display_name: string } | null
  _circle_count: number
}

type NexusOption = { id: string; name: string }
type GuideOption = { id: string; display_name: string }

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

function HubForm({
  initial,
  nexuses,
  guides,
  onSave,
  onCancel,
  isPending,
  error,
}: {
  initial?:  HubRow
  nexuses:   NexusOption[]
  guides:    GuideOption[]
  onSave:    (fd: FormData) => void
  onCancel:  () => void
  isPending: boolean
  error:     string | null
}) {
  const [name,    setName]    = useState(initial?.name ?? '')
  const [nexusId, setNexusId] = useState(initial?.nexus_id ?? '')
  const [guideId, setGuideId] = useState(initial?.guide_id ?? '')
  const [status,  setStatus]  = useState(initial?.status ?? 'forming')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('name', name)
    fd.set('nexus_id', nexusId)
    fd.set('guide_id', guideId)
    fd.set('status', status)
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={lbl}>Hub name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North County Hub" required disabled={isPending} className={input} />
      </div>
      {nexuses.length > 0 && (
        <div>
          <label className={lbl}>Nexus</label>
          <select value={nexusId} onChange={e => setNexusId(e.target.value)} disabled={isPending} className={input}>
            <option value="">- No nexus -</option>
            {nexuses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      )}
      {guides.length > 0 && (
        <div>
          <label className={lbl}>Guide</label>
          <select value={guideId} onChange={e => setGuideId(e.target.value)} disabled={isPending} className={input}>
            <option value="">- Assign later -</option>
            {guides.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={lbl}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} disabled={isPending} className={input}>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 pt-1 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
          <Check className="h-3.5 w-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create hub'}
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

export function HubsClient({ hubs, nexuses, guides, initialEditId = null }: { hubs: HubRow[]; nexuses: NexusOption[]; guides: GuideOption[]; initialEditId?: string | null }) {
  // Honor a ?edit=<id> deep-link (the "Edit hub" button on the hub page) when that
  // hub is in this admin's list.
  const [editingId,  setEditingId]   = useState<string | null>(
    initialEditId && hubs.some((h) => h.id === initialEditId) ? initialEditId : null,
  )
  // updateHub throws on failure; catch it so a failed save shows a reason instead
  // of silently closing the editor as if it worked.
  const [error, setError] = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  const columns: ColumnDef<HubRow>[] = [
    {
      key: 'name',
      header: 'Hub',
      render: (h) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text">{h.name}</span>
          <StatusChip tone={STATUS_TONE[h.status] ?? 'info'} size="sm">
            <span className="capitalize">{h.status}</span>
          </StatusChip>
        </span>
      ),
    },
    {
      key: 'circles',
      header: 'Circles',
      type: 'number',
      render: (h) => <span className="tabular-nums">{h._circle_count}</span>,
    },
    { key: 'nexus', header: 'Nexus', render: (h) => h.nexus?.name ?? <span className="text-subtle">—</span> },
    { key: 'guide', header: 'Guide', render: (h) => h.guide?.display_name ?? <span className="text-subtle">—</span> },
  ]

  return (
    <div>
      <DataTable
        caption="Hubs"
        rows={hubs}
        getRowId={(h) => h.id}
        columns={columns}
        expandedRowId={editingId ?? undefined}
        expandedRow={(h) => (
          <HubForm
            initial={h}
            nexuses={nexuses}
            guides={guides}
            onSave={(fd) => {
              setError(null)
              startTransition(async () => {
                try {
                  await updateHub(h.id, fd)
                  setEditingId(null)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not save the hub.')
                }
              })
            }}
            onCancel={() => { setError(null); setEditingId(null) }}
            isPending={isPending}
            error={error}
          />
        )}
        rowActions={(h) => (
          <button onClick={() => setEditingId(h.id)} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-primary-bg hover:text-primary-strong motion-reduce:transition-none" aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        empty={
          <EmptyState
            variant="first-use"
            title="No hubs yet"
            description="Hubs group circles within a nexus. Create one and assign a guide to oversee it."
          />
        }
      />
    </div>
  )
}
