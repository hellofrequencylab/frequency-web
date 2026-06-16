'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Archive, Check, X } from 'lucide-react'
import { updateCircle, archiveCircle } from '../actions'
import { InviteLinkButton } from './invite-link-button'
import { Button } from '@/components/ui/button'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { DangerModal } from '@/components/admin/danger-modal'
import { ImageUpload } from '@/components/ui/image-upload'
import { StudioWindow } from '@/components/studio/studio-window'
import type { CircleBase } from '@/lib/types/circle'

type CircleRow = CircleBase & {
  about: string | null
  type: string
  hub_id: string | null
  host_id: string | null
  image_url: string | null
  city: string | null
  neighborhood: string | null
  resonance_public: boolean
  hub: { id: string; name: string } | null
  host: { id: string; display_name: string } | null
}

type HubOption  = { id: string; name: string }
type HostOption = { id: string; display_name: string }

const STATUSES = ['forming', 'active', 'paused', 'archived'] as const

const input  = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl    = 'block text-xs font-medium text-muted mb-1'

// The one status vocabulary (retired the local STATUS_COLOR dict, ADR-233 §4).
const STATUS_TONE: Record<string, StatusTone> = {
  forming: 'info',
  active: 'success',
  paused: 'warning',
  archived: 'neutral',
}

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
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood ?? '')
  const [resonancePublic, setResonancePublic] = useState(initial?.resonance_public ?? false)

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
    fd.set('image_url', imageUrl)
    fd.set('city', city)
    fd.set('neighborhood', neighborhood)
    if (resonancePublic) fd.set('resonance_public', 'on')
    else fd.set('resonance_public', 'off')
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={lbl}>Circle name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Encinitas Morning Ride" required disabled={isPending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className={lbl}>About <span className="font-normal text-subtle">(optional)</span></label>
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

      <div className="sm:col-span-2">
        <ImageUpload
          label="Cover image"
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? '')}
          folder="circle-covers"
          hint="Shown on the circle's card and header."
          disabled={isPending}
        />
      </div>

      <div>
        <label className={lbl}>City <span className="font-normal text-subtle">(optional)</span></label>
        <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Encinitas" disabled={isPending} className={input} />
      </div>

      <div>
        <label className={lbl}>Neighborhood <span className="font-normal text-subtle">(optional)</span></label>
        <input type="text" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="e.g. Leucadia" disabled={isPending} className={input} />
      </div>

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={resonancePublic} onChange={e => setResonancePublic(e.target.checked)} disabled={isPending} className="h-4 w-4 rounded border-border-strong text-primary focus:ring-2 focus:ring-primary/40" />
          Show this circle&apos;s resonance publicly
        </label>
      </div>

      <div className="flex items-center gap-2 pt-1 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
          <Check className="h-3.5 w-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Create circle'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isPending}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </form>
  )
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
  const [confirmArchive, setConfirmArchive] = useState<CircleRow | null>(null)
  const [isPending,  startTransition] = useTransition()
  const router = useRouter()

  function handleUpdate(id: string, fd: FormData) {
    startTransition(async () => {
      await updateCircle(id, fd)
      setEditingId(null)
      router.refresh()
    })
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      await archiveCircle(id)
    })
  }

  const active = circles.filter(c => c.status !== 'archived')
  const archived = circles.filter(c => c.status === 'archived')
  const editingCircle = editingId ? circles.find((c) => c.id === editingId) ?? null : null

  const columns: ColumnDef<CircleRow>[] = [
    {
      key: 'name',
      header: 'Circle',
      render: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text">{c.name}</span>
          <StatusChip tone={STATUS_TONE[c.status] ?? 'info'} size="sm">
            <span className="capitalize">{c.status}</span>
          </StatusChip>
          <StatusChip tone="neutral" size="sm">{c.type}</StatusChip>
        </span>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      type: 'number',
      render: (c) => <span className="tabular-nums">{c.member_count}/{c.member_cap}</span>,
    },
    { key: 'hub', header: 'Hub', render: (c) => c.hub?.name ?? <span className="text-subtle">—</span> },
    { key: 'host', header: 'Host', render: (c) => c.host?.display_name ?? <span className="text-subtle">—</span> },
  ]

  return (
    <div>
      <DataTable
        caption="Circles"
        rows={active}
        getRowId={(c) => c.id}
        columns={columns}
        rowActions={(c) => (
          <div className="flex items-center gap-1">
            <InviteLinkButton circleId={c.id} />
            <button onClick={() => setEditingId(c.id)} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-primary-bg hover:text-primary-strong motion-reduce:transition-none" aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button onClick={() => setConfirmArchive(c)} disabled={isPending} className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-warning-bg hover:text-warning disabled:opacity-50 motion-reduce:transition-none" aria-label="Archive">
              <Archive className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        empty={
          <EmptyState
            variant="first-use"
            title="No circles yet"
            description="Create a circle to give your people a place to gather. Each circle needs a hub to appear in the hierarchy."
          />
        }
      />

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer select-none text-xs font-medium text-subtle hover:text-muted">
            {archived.length} archived circle{archived.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2 opacity-60">
            {archived.map(circle => (
              <div key={circle.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                <span className="flex-1 text-sm text-muted">{circle.name}</span>
                <span className="text-xs text-subtle">archived</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {editingCircle && (
        <StudioWindow open onClose={() => setEditingId(null)} eyebrow="Studio · Circle">
          <CircleForm
            initial={editingCircle}
            hubs={hubs}
            hosts={hosts}
            onSave={(fd) => handleUpdate(editingCircle.id, fd)}
            onCancel={() => setEditingId(null)}
            isPending={isPending}
          />
        </StudioWindow>
      )}

      <DangerModal
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        title="Archive this circle?"
        body={
          <>
            Archiving <span className="font-semibold text-text">{confirmArchive?.name}</span> hides it from members. You can still find it in the archived list.
          </>
        }
        confirmLabel="Archive circle"
        onConfirm={() => {
          if (confirmArchive) handleArchive(confirmArchive.id)
        }}
      />
    </div>
  )
}
