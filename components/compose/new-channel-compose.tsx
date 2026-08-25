'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createChannel } from '@/app/(main)/channels/actions'
import { StudioWindow } from '@/components/studio/studio-window'
import { StudioFooter } from '@/components/studio/kit/studio-footer'
import { Field, Input, Textarea, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface ScopeOption {
  scope: 'hub' | 'nexus' | 'outpost'
  scopeId: string
  label: string
}

// Create a channel in the shared Studio popup — the same vibe as every other Add/Edit
// surface. Keeps every field (name, type, scope, event date, description, public toggle)
// and calls createChannel, which redirects into the new channel on success.
export function NewChannelCompose({
  scopeOptions,
  buttonLabel = 'New Channel',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
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

  function submit() {
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
        setName('')
        setDescription('')
        setEventDate('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create channel.')
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
          eyebrow="Studio · Channel"
          footer={
            <StudioFooter
              left={
                error ? (
                  <span className="text-meta text-danger">{error}</span>
                ) : (
                  <span className="text-meta text-subtle">A topical or event space for your people.</span>
                )
              }
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="rounded-control border border-border px-4 py-2 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={submit}
                disabled={!name.trim() || !selected || isPending}
              >
                {isPending ? 'Creating…' : 'Create channel'}
              </Button>
            </StudioFooter>
          }
        >
          <div className="space-y-5">
            <Field label="Channel name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wednesday Rides"
                maxLength={80}
                disabled={isPending}
              />
            </Field>

            <div className="space-y-1.5">
              {/* Not a <Label>: this names a group of buttons, and a <label> would bind to the
                  first labelable descendant rather than to the set. */}
              <span className={labelClasses}>Type</span>
              <div className="flex gap-2">
                {(['group', 'event', 'thread'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    disabled={isPending}
                    aria-pressed={type === t}
                    className={`flex-1 rounded-lg border px-3 py-2 text-meta font-medium capitalize transition-colors ${
                      type === t
                        ? 'border-primary bg-primary-bg text-primary-strong'
                        : 'border-border text-muted hover:bg-surface-elevated'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {scopeOptions.length > 0 && (
              <Field label="Visible to">
                <Select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={isPending}
                >
                  {scopeOptions.map((opt) => (
                    <option key={`${opt.scope}|${opt.scopeId}`} value={`${opt.scope}|${opt.scopeId}`}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {type === 'event' && (
              <Field label="Event date">
                <Input
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  disabled={isPending}
                />
              </Field>
            )}

            <Field label={<>Description <span className="font-normal text-subtle">(optional)</span></>}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this channel for?"
                rows={3}
                maxLength={280}
                disabled={isPending}
                className="resize-y leading-relaxed"
              />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              {/* The text beside the switch reports the STATE, and it flips with the toggle, so
                  it cannot be the name (a name that changes when you flip it is not a name).
                  `aria-checked` already carries the state; the name says what the switch does. */}
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                aria-label="Public channel"
                onClick={() => setIsPublic(!isPublic)}
                disabled={isPending}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-pill border-2 border-transparent transition-colors ${
                  isPublic ? 'bg-primary' : 'bg-border-strong'
                } disabled:opacity-60`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-pill bg-canvas shadow transition-transform ${
                    isPublic ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-meta text-text">
                {isPublic ? 'Public: discoverable in your nexus' : 'Private: invite only'}
              </span>
            </div>
          </div>
        </StudioWindow>
      )}
    </>
  )
}
