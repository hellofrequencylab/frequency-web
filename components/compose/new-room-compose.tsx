'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Hash, Lock, Globe } from 'lucide-react'
import { createRoom } from '@/app/(main)/messages/rooms/actions'
import { isError } from '@/lib/action-result'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

type Visibility = 'public' | 'private'

export function NewRoomCompose({
  buttonLabel = 'New Room',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  buttonLabel?: string
  buttonClass?: string
} = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('description', description.trim())
    fd.set('visibility', visibility)

    startTransition(async () => {
      try {
        const result = await createRoom(fd)
        if (isError(result)) {
          setError(result.error)
          return
        }
        setOpen(false)
        setName(''); setDescription('')
        router.push(`/messages/r/${result.data.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create room.')
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
        title="New Room" titleIcon={Hash} titleIconColor="indigo"
        submitLabel="Create Room" pendingLabel="Creating…"
        submitDisabled={!name.trim()} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Room name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Sunday Brunch Crew" required disabled={isPending} className={cmInput} />
        </div>

        <div>
          <label className={cmLabel}>Description <span className="text-subtle font-normal">(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What is this room for?" rows={3} disabled={isPending}
            className={`${cmInput} resize-y leading-relaxed`} />
        </div>

        <div>
          <label className={cmLabel}>Visibility</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setVisibility('public')} disabled={isPending}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                visibility === 'public'
                  ? 'border-primary bg-primary-bg'
                  : 'border-border hover:bg-surface-elevated'
              }`}>
              <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${visibility === 'public' ? 'text-primary-strong' : 'text-subtle'}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${visibility === 'public' ? 'text-primary-strong' : 'text-text'}`}>Public</p>
                <p className="text-[11px] text-subtle">Anyone can find and join</p>
              </div>
            </button>
            <button type="button" onClick={() => setVisibility('private')} disabled={isPending}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                visibility === 'private'
                  ? 'border-primary bg-primary-bg'
                  : 'border-border hover:bg-surface-elevated'
              }`}>
              <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${visibility === 'private' ? 'text-primary-strong' : 'text-subtle'}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${visibility === 'private' ? 'text-primary-strong' : 'text-text'}`}>Private</p>
                <p className="text-[11px] text-subtle">Invite only</p>
              </div>
            </button>
          </div>
        </div>
      </CreateModal>
    </>
  )
}
