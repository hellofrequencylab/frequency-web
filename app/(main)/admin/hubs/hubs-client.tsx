'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { updateHub } from '../actions'

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
const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl   = 'block text-xs font-medium text-muted mb-1'

const STATUS_COLOR: Record<string, string> = {
  forming:  'bg-signal-bg text-signal-strong',
  active:   'bg-success-bg text-success dark:bg-success-bg',
  paused:   'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  archived: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
}

function HubForm({
  initial,
  nexuses,
  guides,
  onSave,
  onCancel,
  isPending,
}: {
  initial?:  HubRow
  nexuses:   NexusOption[]
  guides:    GuideOption[]
  onSave:    (fd: FormData) => void
  onCancel:  () => void
  isPending: boolean
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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg mb-4">
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
      <div className="sm:col-span-2 flex items-center gap-2 pt-1">
        <button type="submit" disabled={!name.trim() || isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors">
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create hub'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors">
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

export function HubsClient({ hubs, nexuses, guides, initialEditId = null }: { hubs: HubRow[]; nexuses: NexusOption[]; guides: GuideOption[]; initialEditId?: string | null }) {
  // Honor a ?edit=<id> deep-link (the "Edit hub" button on the hub page) when that
  // hub is in this admin's list.
  const [editingId,  setEditingId]   = useState<string | null>(
    initialEditId && hubs.some((h) => h.id === initialEditId) ? initialEditId : null,
  )
  const [isPending,  startTransition] = useTransition()

  return (
    <div>
      <div className="space-y-2">
        {hubs.length === 0 && (
          <p className="text-sm text-subtle py-6 text-center">No hubs yet.</p>
        )}
        {hubs.map(hub => (
          <div key={hub.id}>
            {editingId === hub.id ? (
              <HubForm
                initial={hub}
                nexuses={nexuses}
                guides={guides}
                onSave={(fd) => { startTransition(async () => { await updateHub(hub.id, fd); setEditingId(null) }) }}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text">{hub.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium capitalize ${STATUS_COLOR[hub.status] ?? STATUS_COLOR.forming}`}>
                      {hub.status}
                    </span>
                  </div>
                  <p className="text-xs text-subtle mt-0.5">
                    {hub._circle_count} circle{hub._circle_count !== 1 ? 's' : ''}
                    {hub.nexus && ` · ${hub.nexus.name}`}
                    {hub.guide && ` · Guide: ${hub.guide.display_name}`}
                  </p>
                </div>
                <button onClick={() => setEditingId(hub.id)} className="p-1.5 rounded-lg text-subtle opacity-0 group-hover:opacity-100 hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg transition-all" aria-label="Edit">
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
