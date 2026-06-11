'use client'

import { useState, useTransition } from 'react'
import { Pencil, Archive, Check, X } from 'lucide-react'
import { updateCircle, archiveCircle } from '../actions'
import { InviteLinkButton } from './invite-link-button'
import { Button } from '@/components/ui/button'
import type { CircleBase } from '@/lib/types/circle'

type CircleRow = CircleBase & {
  about: string | null
  type: string
  hub_id: string | null
  host_id: string | null
  hub: { id: string; name: string } | null
  host: { id: string; display_name: string } | null
}

type HubOption  = { id: string; name: string }
type HostOption = { id: string; display_name: string }

const STATUSES = ['forming', 'active', 'paused', 'archived'] as const

const input  = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl    = 'block text-xs font-medium text-muted mb-1'

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
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg mb-4">
      <div className="sm:col-span-2">
        <label className={lbl}>Circle name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Encinitas Morning Ride" required disabled={isPending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className={lbl}>About <span className="text-subtle font-normal">(optional)</span></label>
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
            <option value="">- No hub -</option>
            {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      )}

      {hosts.length > 0 && (
        <div>
          <label className={lbl}>Host</label>
          <select value={hostId} onChange={e => setHostId(e.target.value)} disabled={isPending} className={input}>
            <option value="">- Assign later -</option>
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
        <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create circle'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isPending}>
          <X className="w-3.5 h-3.5" />
          Cancel
        </Button>
      </div>
    </form>
  )
}

const STATUS_COLOR: Record<string, string> = {
  forming:  'bg-signal-bg text-signal-strong',
  active:   'bg-success-bg text-success dark:bg-success-bg',
  paused:   'bg-warning-bg text-warning dark:bg-warning-bg dark:text-warning',
  archived: 'bg-surface-elevated text-muted dark:bg-surface-elevated dark:text-subtle',
}

export function CirclesClient({
  circles,
  hubs,
  hosts,
  initialEditId = null,
}: {
  circles: CircleRow[]
  hubs:    HubOption[]
  hosts:   HostOption[]
  /** Deep-link target (`?edit=<id>`) — opens that circle's editor on load, e.g.
   *  from the "Edit circle" button on the circle page. */
  initialEditId?: string | null
}) {
  // Only honor the deep-link when the circle is actually in this admin's list.
  const [editingId,  setEditingId]  = useState<string | null>(
    initialEditId && circles.some((c) => c.id === initialEditId) ? initialEditId : null,
  )
  const [isPending,  startTransition] = useTransition()

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
      {/* Active list */}
      <div className="space-y-2">
        {active.length === 0 && (
          <p className="text-sm text-subtle py-6 text-center">No circles yet.</p>
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
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text">{circle.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium capitalize ${STATUS_COLOR[circle.status] ?? STATUS_COLOR.forming}`}>
                      {circle.status}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
                      {circle.type}
                    </span>
                  </div>
                  <p className="text-xs text-subtle mt-0.5">
                    {circle.member_count}/{circle.member_cap} members
                    {circle.hub && ` · ${circle.hub.name}`}
                    {circle.host && ` · Host: ${circle.host.display_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <InviteLinkButton circleId={circle.id} />
                  <button onClick={() => setEditingId(circle.id)} className="p-1.5 rounded-lg text-subtle hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors" aria-label="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {circle.status !== 'archived' && (
                    <button onClick={() => handleArchive(circle.id)} disabled={isPending} className="p-1.5 rounded-lg text-subtle hover:text-warning hover:bg-warning-bg dark:hover:bg-warning-bg/30 disabled:opacity-50 transition-colors" aria-label="Archive">
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
          <summary className="text-xs font-medium text-subtle cursor-pointer hover:text-muted select-none">
            {archived.length} archived circle{archived.length > 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-2 opacity-60">
            {archived.map(circle => (
              <div key={circle.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                <span className="text-sm text-muted flex-1">{circle.name}</span>
                <span className="text-xs text-subtle">archived</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
