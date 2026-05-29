'use client'

import { useState, useTransition } from 'react'
import { Plus, Network } from 'lucide-react'
import { createNexus } from '@/app/(main)/admin/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

export function NewNexusCompose({
  outposts,
  buttonLabel = 'New Nexus',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  outposts: { id: string; name: string }[]
  buttonLabel?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [memberCap, setMemberCap] = useState(2500)
  const [outpostId, setOutpostId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !outpostId || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('member_cap', String(memberCap))
    fd.set('status', 'forming')
    fd.set('outpost_id', outpostId)

    startTransition(async () => {
      try {
        await createNexus(fd)
        setOpen(false)
        setName('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create nexus.')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title="New Nexus" titleIcon={Network} titleIconColor="violet"
        submitLabel="Create Nexus" pendingLabel="Creating…"
        submitDisabled={!name.trim() || !outpostId} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Nexus name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. San Diego" required disabled={isPending} className={cmInput} />
        </div>
        <div>
          <label className={cmLabel}>Outpost *</label>
          <select value={outpostId} onChange={e => setOutpostId(e.target.value)}
            required disabled={isPending} className={cmInput}>
            <option value="" disabled>Select an outpost…</option>
            {outposts.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={cmLabel}>Member cap</label>
          <input type="number" min={100} max={10000} value={memberCap}
            onChange={e => setMemberCap(parseInt(e.target.value) || 2500)}
            disabled={isPending} className={cmInput} />
        </div>
      </CreateModal>
    </>
  )
}
