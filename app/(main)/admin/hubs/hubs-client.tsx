'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Check, X } from 'lucide-react'
import { createHub, updateHub } from '../actions'

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
const input = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50 placeholder:text-gray-400'
const lbl   = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

const STATUS_COLOR: Record<string, string> = {
  forming:  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  active:   'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  paused:   'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 mb-4">
      <div className="sm:col-span-2">
        <label className={lbl}>Hub name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North County Hub" required disabled={isPending} className={input} />
      </div>
      {nexuses.length > 0 && (
        <div>
          <label className={lbl}>Nexus</label>
          <select value={nexusId} onChange={e => setNexusId(e.target.value)} disabled={isPending} className={input}>
            <option value="">— No nexus —</option>
            {nexuses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      )}
      {guides.length > 0 && (
        <div>
          <label className={lbl}>Guide</label>
          <select value={guideId} onChange={e => setGuideId(e.target.value)} disabled={isPending} className={input}>
            <option value="">— Assign later —</option>
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
        <button type="submit" disabled={!name.trim() || isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create hub'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

export function HubsClient({ hubs, nexuses, guides }: { hubs: HubRow[]; nexuses: NexusOption[]; guides: GuideOption[] }) {
  const [showCreate, setShowCreate]  = useState(false)
  const [editingId,  setEditingId]   = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  return (
    <div>
      {showCreate ? (
        <HubForm nexuses={nexuses} guides={guides} onSave={(fd) => { startTransition(async () => { await createHub(fd); setShowCreate(false) }) }} onCancel={() => setShowCreate(false)} isPending={isPending} />
      ) : (
        <button onClick={() => setShowCreate(true)} className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          <Plus className="w-4 h-4" />
          New hub
        </button>
      )}

      <div className="space-y-2">
        {hubs.length === 0 && !showCreate && (
          <p className="text-sm text-gray-400 py-6 text-center">No hubs yet.</p>
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
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{hub.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[hub.status] ?? STATUS_COLOR.forming}`}>
                      {hub.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {hub._circle_count} circle{hub._circle_count !== 1 ? 's' : ''}
                    {hub.nexus && ` · ${hub.nexus.name}`}
                    {hub.guide && ` · Guide: ${hub.guide.display_name}`}
                  </p>
                </div>
                <button onClick={() => setEditingId(hub.id)} className="p-1.5 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all" aria-label="Edit">
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
