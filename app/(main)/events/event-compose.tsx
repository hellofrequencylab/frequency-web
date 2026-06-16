'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createEvent } from './actions'
import { StudioWindow } from '@/components/studio/studio-window'
import { StudioFooter } from '@/components/studio/kit/studio-footer'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'

type Group = { id: string; name: string }

// Admin "quick create" for an event, on the shared Studio popup — the same window every other
// Add/Edit surface uses. Keeps the createEvent call + behavior (it redirects to the new event on
// success); the window provides the chrome.
export function EventCompose({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [scopeId, setScopeId] = useState(groups[0]?.id ?? '')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submitDisabled = !title.trim() || !scopeId || !startsAt || groups.length === 0

  function submit() {
    if (!title.trim() || !scopeId || !startsAt || isPending) return
    setError(null)

    const fd = new FormData()
    fd.set('title', title.trim())
    fd.set('description', description.trim())
    fd.set('location', location.trim())
    fd.set('scopeId', scopeId)
    fd.set('scopeType', 'group')
    fd.set('startsAt', startsAt)
    if (endsAt) fd.set('endsAt', endsAt)

    startTransition(async () => {
      try {
        await createEvent(fd)
        setOpen(false)
        setTitle('')
        setDescription('')
        setLocation('')
        setStartsAt('')
        setEndsAt('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create event.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap"
      >
        <Plus className="h-4 w-4" />
        New Event
      </button>

      {open && (
        <StudioWindow
          open
          onClose={() => setOpen(false)}
          eyebrow="Studio · Event"
          footer={
            <StudioFooter
              left={
                error ? (
                  <span className="text-xs text-danger">{error}</span>
                ) : (
                  <span className="text-xs text-subtle">A gathering for your circle.</span>
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
                disabled={submitDisabled || isPending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {isPending ? 'Creating…' : 'Create Event'}
              </button>
            </StudioFooter>
          }
        >
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              You must be in a circle to create an event.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Event title *</Label>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Wednesday Morning Ride"
                  required
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Circle *</Label>
                <select
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  required
                  disabled={isPending}
                  className={fieldClasses}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Starts at *</Label>
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Ends at <span className="font-normal text-subtle">(optional)</span>
                  </Label>
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Location <span className="font-normal text-subtle">(optional)</span>
                </Label>
                <Input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Balboa Park, San Diego"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label>
                  Description <span className="font-normal text-subtle">(optional)</span>
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Details, what to bring, meetup point…"
                  rows={4}
                  disabled={isPending}
                  className="resize-y leading-relaxed"
                />
              </div>
            </div>
          )}
        </StudioWindow>
      )}
    </>
  )
}
