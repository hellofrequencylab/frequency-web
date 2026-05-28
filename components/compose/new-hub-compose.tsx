'use client'

import { useState, useTransition } from 'react'
import { Plus, Building2 } from 'lucide-react'
import { createHub } from '@/app/(main)/admin/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

interface NexusOption { id: string; name: string }

export function NewHubCompose({
  nexuses = [],
  buttonLabel = 'New Hub',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors',
}: {
  nexuses?: NexusOption[]
  buttonLabel?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [nexusId, setNexusId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('status', 'forming')
    if (nexusId) fd.set('nexus_id', nexusId)

    startTransition(async () => {
      try {
        await createHub(fd)
        setOpen(false)
        setName(''); setNexusId('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create hub.')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="w-3.5 h-3.5" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title="New Hub" titleIcon={Building2} titleIconColor="violet"
        submitLabel="Create Hub" pendingLabel="Creating…"
        submitDisabled={!name.trim()} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Hub name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. North County" required disabled={isPending} className={cmInput} />
        </div>
        {nexuses.length > 0 && (
          <div>
            <label className={cmLabel}>Nexus <span className="text-gray-400 font-normal">(optional)</span></label>
            <select value={nexusId} onChange={e => setNexusId(e.target.value)}
              disabled={isPending} className={cmInput}>
              <option value="">— None —</option>
              {nexuses.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        )}
      </CreateModal>
    </>
  )
}
