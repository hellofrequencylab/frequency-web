'use client'

import { useState, useTransition } from 'react'
import { Plus, CircleDot } from 'lucide-react'
import { createCircle } from '@/app/(main)/admin/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

interface HubOption { id: string; name: string }

export function NewCircleCompose({
  hubs = [],
  topicalChannelId,
  topicalChannelName,
  buttonLabel = 'New Circle',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  hubs?: HubOption[]
  /** When set, the new circle declares this topical channel as its topic. */
  topicalChannelId?: string
  /** Optional channel name used in the modal copy so the framing reads
   *  like "Start a circle practicing Spirituality" instead of generic. */
  topicalChannelName?: string
  buttonLabel?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [type, setType] = useState<'in-person' | 'online'>('in-person')
  const [memberCap, setMemberCap] = useState(50)
  const [hubId, setHubId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const inChannel = !!topicalChannelId

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('about', about.trim())
    fd.set('type', type)
    fd.set('member_cap', String(memberCap))
    fd.set('status', 'forming')
    if (hubId) fd.set('hub_id', hubId)
    if (topicalChannelId) fd.set('topical_channel_id', topicalChannelId)

    startTransition(async () => {
      try {
        await createCircle(fd)
        setOpen(false)
        setName(''); setAbout(''); setHubId('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create circle.')
      }
    })
  }

  const modalTitle = inChannel && topicalChannelName
    ? `Start a circle practicing ${topicalChannelName}`
    : 'New Circle'

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title={modalTitle} titleIcon={CircleDot} titleIconColor="green"
        submitLabel="Create Circle" pendingLabel="Creating…"
        submitDisabled={!name.trim()} isPending={isPending} error={error}
      >
        {inChannel && (
          <p className="text-sm text-muted leading-relaxed">
            A circle is your local crew, up to 50 people, who meet regularly
            around a shared practice. This one will be tagged as practicing
            {topicalChannelName ? <> <span className="font-semibold text-text">{topicalChannelName}</span></> : ' this channel'}
            , and you&apos;ll be the first host. No hub or nexus needed yet.
            Once a few neighbouring circles form, they crystallise into a hub
            together.
          </p>
        )}
        <div>
          <label className={cmLabel}>Circle name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Encinitas Tuesday Ride" required disabled={isPending} className={cmInput} />
        </div>
        <div>
          <label className={cmLabel}>About <span className="text-subtle font-normal">(optional)</span></label>
          <textarea value={about} onChange={e => setAbout(e.target.value)}
            placeholder="What is this circle about?" rows={3} disabled={isPending}
            className={`${cmInput} resize-y leading-relaxed`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={cmLabel}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'in-person' | 'online')}
              disabled={isPending} className={cmInput}>
              <option value="in-person">In-person</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className={cmLabel}>Member cap</label>
            <input type="number" min={5} max={200} value={memberCap}
              onChange={e => setMemberCap(parseInt(e.target.value) || 50)}
              disabled={isPending} className={cmInput} />
          </div>
        </div>
        {!inChannel && hubs.length > 0 && (
          <div>
            <label className={cmLabel}>Hub <span className="text-subtle font-normal">(optional)</span></label>
            <select value={hubId} onChange={e => setHubId(e.target.value)}
              disabled={isPending} className={cmInput}>
              <option value="">None</option>
              {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        )}
      </CreateModal>
    </>
  )
}
