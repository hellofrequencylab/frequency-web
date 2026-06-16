'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Lock, Globe } from 'lucide-react'
import { createRoom } from '@/app/(main)/messages/rooms/actions'
import { isError } from '@/lib/action-result'
import { StudioWindow } from '@/components/studio/studio-window'
import { StudioFooter } from '@/components/studio/kit/studio-footer'
import { Input, Textarea, Label } from '@/components/ui/field'

type Visibility = 'public' | 'private'

// Create a message board (room) in the shared Studio popup — the same vibe as every other
// Add/Edit surface. Creates the room (createRoom) then drops you into it.
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

  function submit() {
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
        setName('')
        setDescription('')
        router.push(`/messages/r/${result.data.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create board.')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="h-4 w-4" />
        {buttonLabel}
      </button>

      {open && (
        <StudioWindow
          open
          onClose={() => setOpen(false)}
          eyebrow="Studio · Board"
          footer={
            <StudioFooter
              left={
                error ? (
                  <span className="text-xs text-danger">{error}</span>
                ) : (
                  <span className="text-xs text-subtle">A board your circle can gather in.</span>
                )
              }
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!name.trim() || isPending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {isPending ? 'Creating…' : 'Create board'}
              </button>
            </StudioFooter>
          }
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Board name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sunday Brunch Crew"
                maxLength={80}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description <span className="font-normal text-subtle">(optional)</span></Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this board for?"
                rows={3}
                maxLength={280}
                disabled={isPending}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Who can see it</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['public', Globe, 'Public', 'Anyone can find and join'],
                  ['private', Lock, 'Private', 'Invite only'],
                ] as const).map(([v, Icon, title, sub]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    disabled={isPending}
                    aria-pressed={visibility === v}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      visibility === v ? 'border-primary bg-primary-bg ring-2 ring-primary/30' : 'border-border hover:bg-surface-elevated'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${visibility === v ? 'text-primary-strong' : 'text-subtle'}`} />
                    <span className="min-w-0">
                      <span className={`block text-xs font-semibold ${visibility === v ? 'text-primary-strong' : 'text-text'}`}>{title}</span>
                      <span className="block text-2xs text-subtle">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </StudioWindow>
      )}
    </>
  )
}
