'use client'

import { useState, useTransition } from 'react'
import { Plus, Network } from 'lucide-react'
import { createNexus } from '@/app/(main)/admin/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

export function NewNexusCompose({
  buttonLabel = 'New Nexus',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors',
}: {
  buttonLabel?: string
  buttonClass?: string
} = {}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [memberCap, setMemberCap] = useState(2500)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('member_cap', String(memberCap))
    fd.set('status', 'forming')

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
        <Plus className="w-3.5 h-3.5" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title="New Nexus" titleIcon={Network} titleIconColor="violet"
        submitLabel="Create Nexus" pendingLabel="Creating…"
        submitDisabled={!name.trim()} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Nexus name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. San Diego" required disabled={isPending} className={cmInput} />
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
