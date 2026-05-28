'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Hash, Lock, Globe } from 'lucide-react'
import { createRoom } from '@/app/(main)/messages/rooms/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

type Visibility = 'public' | 'private'

export function NewRoomCompose({
  buttonLabel = 'New Room',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap',
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
        if ('error' in result) {
          setError(result.error)
          return
        }
        setOpen(false)
        setName(''); setDescription('')
        router.push(`/messages/r/${result.id}`)
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
          <label className={cmLabel}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
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
                  ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${visibility === 'public' ? 'text-indigo-500' : 'text-gray-400'}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${visibility === 'public' ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>Public</p>
                <p className="text-[11px] text-gray-400">Anyone can find and join</p>
              </div>
            </button>
            <button type="button" onClick={() => setVisibility('private')} disabled={isPending}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                visibility === 'private'
                  ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${visibility === 'private' ? 'text-indigo-500' : 'text-gray-400'}`} />
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${visibility === 'private' ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>Private</p>
                <p className="text-[11px] text-gray-400">Invite only</p>
              </div>
            </button>
          </div>
        </div>
      </CreateModal>
    </>
  )
}
