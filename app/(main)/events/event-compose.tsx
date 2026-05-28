'use client'

import { useState, useTransition } from 'react'
import { Plus, CalendarDays } from 'lucide-react'
import { createEvent } from './actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

type Group = { id: string; name: string }

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
        <Plus className="w-4 h-4" />
        New Event
      </button>

      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        title="New Event"
        titleIcon={CalendarDays}
        titleIconColor="amber"
        submitLabel="Create Event"
        pendingLabel="Creating…"
        submitDisabled={!title.trim() || !scopeId || !startsAt || groups.length === 0}
        isPending={isPending}
        error={error}
      >
        {groups.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            You must be in a circle to create an event.
          </p>
        ) : (
          <>
            <div>
              <label className={cmLabel}>Event title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Wednesday Morning Ride"
                required
                disabled={isPending}
                className={cmInput}
              />
            </div>

            <div>
              <label className={cmLabel}>Circle *</label>
              <select
                value={scopeId}
                onChange={e => setScopeId(e.target.value)}
                required
                disabled={isPending}
                className={cmInput}
              >
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={cmLabel}>Starts at *</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={e => setStartsAt(e.target.value)}
                  required
                  disabled={isPending}
                  className={cmInput}
                />
              </div>
              <div>
                <label className={cmLabel}>
                  Ends at <span className="text-subtle font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={e => setEndsAt(e.target.value)}
                  disabled={isPending}
                  className={cmInput}
                />
              </div>
            </div>

            <div>
              <label className={cmLabel}>
                Location <span className="text-subtle font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Balboa Park, San Diego"
                disabled={isPending}
                className={cmInput}
              />
            </div>

            <div>
              <label className={cmLabel}>
                Description <span className="text-subtle font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Details, what to bring, meetup point…"
                rows={4}
                disabled={isPending}
                className={`${cmInput} resize-y leading-relaxed`}
              />
            </div>
          </>
        )}
      </CreateModal>
    </>
  )
}
