'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Archive, Check, X } from 'lucide-react'
import { createCircle, updateCircle, archiveCircle } from '../actions'

type CircleRow = {
  id: string
  name: string
  about: string | null
  type: string
  status: string
  member_count: number
  member_cap: number
  hub_id: string | null
  host_id: string | null
  hub: { id: string; name: string } | null
  host: { id: string; display_name: string } | null
}

type HubOption  = { id: string; name: string }
type HostOption = { id: string; display_name: string }

const STATUSES = ['forming', 'active', 'paused', 'archived'] as const

const input  = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50 placeholder:text-gray-400'
const lbl    = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

function CircleForm({
  initial,
  hubs,
  hosts,
  onSave,
  onCancel,
  isPending,
}: {
  initial?:  CircleRow
  hubs:      HubOption[]
  hosts:     HostOption[]
  onSave:    (fd: FormData) => void
  onCancel:  () => void
  isPending: boolean
}) {
  const [name,   setName]   = useState(initial?.name ?? '')
  const [about,  setAbout]  = useState(initial?.about ?? '')
  const [type,   setType]   = useState(initial?.type ?? 'in-person')
  const [cap,    setCap]    = useState(String(initial?.member_cap ?? 12))
  const [hubId,  setHubId]  = useState(initial?.hub_id ?? '')
  const [hostId, setHostId] = useState(initial?.host_id ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'forming')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('name', name)
    fd.set('about', about)
    fd.set('type', type)
    fd.set('member_cap', cap)
    fd.set('hub_id', hubId)
    fd.set('host_id', hostId)
    fd.set('status', status)
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 mb-4">
      <div className="sm:col-span-2">
        <label className={lbl}>Circle name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Encinitas Morning Ride" required disabled={isPending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className={lbl}>About <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea value={about} onChange={e => setAbout(e.target.value)} placeholder="What is this circle about?" rows={2} disabled={isPending} className={`${input} resize-none`} />
      </div>

      <div>
        <label className={lbl}>Type</label>
        <select value={type} onChange={e => setType(e.target.value)} disabled={isPending} className={input}>
          <option value="in-person">In-person</option>
          <option value="online">Online</option>
        </select>
      </div>

      <div>
        <label className={lbl}>Member cap</label>
        <input type="number" min="1" max="500" value={cap} onChange={e => setCap(e.target.value)} required disabled={isPending} className={input} />
      </div>

      {hubs.length > 0 && (
        <div>
          <label className={lbl}>Hub</label>
          <select value={hubId} onChange={e => setHubId(e.target.value)} disabled={isPending} className={input}>
            <option value="">— No hub —</option>
            {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      )}

      {hosts.length > 0 && (
        <div>
          <label className={lbl}>Host</label>
          <select value={hostId} onChange={e => setHostId(e.target.value)} disabled={isPending} className={input}>
            <option value="">— Assign later —</option>
            {hosts.map(h => <option key={h.id} value={h.id}>{h.display_name}</option>)}
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
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create circle'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

const STATUS_COLOR: Record<string, string> = {
  forming:  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  active:   'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  paused:   'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export function CirclesClient({
  circles,
  hubs,
  hosts,
}: {
  circles: CircleRow[]
  hubs:    HubOption[]
  hosts:   HostOption[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  function handleCreate(fd: FormData) {
    startTransition(async () => {
      await createCircle(fd)
      setShowCreate(false)
    })
  }

  function handleUpdate(id: string, fd: FormData) {
    startTransition(async () => {
      await updateCircle(id, fd)
      setEditingId(null)
    })
  }

  function handleArchive(id: string) {
    if (!confirm('Archive this circle? Members will no longer see it.')) return
    startTransition(async () => {
      await archiveCircle(id)
    })
  }

  const active = circles.filter(c => c.status !== 'archived')
  const archived = circles.filter(c => c.status === 'archived')

  return (
    <div>
      {/* Create */}
      {showCreate ? (
        <CircleForm hubs={hubs} hosts={hosts} onSave={handleCreate} onCancel={() => setShowCreate(false)} isPending={isPending} />
      ) : (
        <button onClick={() => setShowCreate(true)} className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          <Plus className="w-4 h-4" />
          New circle
        </button>
      )}

      {/* Active list */}
      <div className="space-y-2">
        {active.length === 0 && !showCreate && (
          <p className="text-sm text-gray-400 py-6 text-center">No circles yet.</p>
        )}
        {active.map(circle => (
          <div key={circle.id}>
            {editingId === circle.id ? (
              <CircleForm
                initial={circle}
                hubs={hubs}
                hosts={hosts}
                onSave={(fd) => handleUpdate(circle.id, fd)}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{circle.name}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[circle.status] ?? STATUS_COLOR.forming}`}>
                      {circle.status}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium">
                      {circle.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {circle.member_count}/{circle.member_cap} members
                    {circle.hub && ` · ${circle.hub.name}`}
                    {circle.host && ` · Host: ${circle.host.display_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingId(circle.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" aria-label="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {circle.status !== 'archived' && (
                    <button onClick={() => handleArchive(circle.id)} disabled={isPending} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors" aria-label="Archive">
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Archived section */}
      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="text-xs font-medium text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            {archived.length} archived circle{archived.length > 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-2 opacity-60">
            {archived.map(circle => (
              <div key={circle.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3">
                <span className="text-sm text-gray-500 flex-1">{circle.name}</span>
                <span className="text-xs text-gray-400">archived</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
