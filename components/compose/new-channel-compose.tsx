'use client'

import { useState, useTransition } from 'react'
import { Plus, Radio } from 'lucide-react'
import { createChannel } from '@/app/(main)/channels/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

interface ScopeOption {
  scope: 'hub' | 'nexus' | 'outpost'
  scopeId: string
  label: string
}

export function NewChannelCompose({
  scopeOptions,
  buttonLabel = 'New Channel',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors whitespace-nowrap',
}: {
  scopeOptions: ScopeOption[]
  buttonLabel?: string
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState(
    scopeOptions[0] ? `${scopeOptions[0].scope}|${scopeOptions[0].scopeId}` : ''
  )
  const [type, setType] = useState<'group' | 'event' | 'thread'>('group')
  const [isPublic, setIsPublic] = useState(true)
  const [eventDate, setEventDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !selected || isPending) return
    setError(null)

    const [scope, scopeId] = selected.split('|')
    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('description', description.trim())
    fd.set('scope', scope)
    fd.set('scopeId', scopeId)
    fd.set('type', type)
    fd.set('isPublic', String(isPublic))
    if (eventDate && type === 'event') fd.set('eventDate', eventDate)

    startTransition(async () => {
      try {
        await createChannel(fd)
        setOpen(false)
        setName(''); setDescription(''); setEventDate('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create channel.')
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
        title="New Channel" titleIcon={Radio} titleIconColor="blue"
        submitLabel="Create Channel" pendingLabel="Creating…"
        submitDisabled={!name.trim() || !selected} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Channel name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Wednesday Rides" required disabled={isPending} className={cmInput} />
        </div>

        <div>
          <label className={cmLabel}>Type</label>
          <div className="flex gap-2">
            {(['group', 'event', 'thread'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                disabled={isPending}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors capitalize ${
                  type === t
                    ? 'border-primary bg-primary-bg text-primary-strong dark:bg-primary-bg dark:text-primary-strong'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {scopeOptions.length > 0 && (
          <div>
            <label className={cmLabel}>Visible to *</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              required disabled={isPending} className={cmInput}>
              {scopeOptions.map(opt => (
                <option key={`${opt.scope}|${opt.scopeId}`} value={`${opt.scope}|${opt.scopeId}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === 'event' && (
          <div>
            <label className={cmLabel}>Event date</label>
            <input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)}
              disabled={isPending} className={cmInput} />
          </div>
        )}

        <div>
          <label className={cmLabel}>Description <span className="text-subtle font-normal">(optional)</span></label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What is this channel for?" rows={3} disabled={isPending}
            className={`${cmInput} resize-y leading-relaxed`} />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button type="button" role="switch" aria-checked={isPublic}
            onClick={() => setIsPublic(!isPublic)} disabled={isPending}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              isPublic ? 'bg-primary' : 'bg-border-strong'
            } disabled:opacity-60`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isPublic ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
          <span className="text-xs text-text">
            {isPublic ? 'Public: discoverable in your nexus' : 'Private: invite only'}
          </span>
        </div>
      </CreateModal>
    </>
  )
}
