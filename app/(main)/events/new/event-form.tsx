'use client'

import { useState, useTransition } from 'react'
import { createEvent } from '@/app/(main)/events/actions'

type Group = {
  id: string
  name: string
}

export function EventForm({ groups }: { groups: Group[] }) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [scopeId, setScopeId] = useState(groups[0]?.id ?? '')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scopeId || !startsAt || isPending) return

    const fd = new FormData()
    fd.set('title', title.trim())
    fd.set('description', description.trim())
    fd.set('location', location.trim())
    fd.set('scopeId', scopeId)
    fd.set('scopeType', 'group')
    fd.set('startsAt', startsAt)
    if (endsAt) fd.set('endsAt', endsAt)

    startTransition(async () => {
      await createEvent(fd)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Event title <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Wednesday Morning Ride"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text placeholder-subtle outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
      </div>

      {/* Group */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Group <span className="text-danger">*</span>
        </label>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">You must be in a group to create an event.</p>
        ) : (
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            required
            disabled={isPending}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Start */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Starts at <span className="text-danger">*</span>
        </label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
          disabled={isPending}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
      </div>

      {/* End */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Ends at <span className="text-xs text-subtle font-normal">(optional)</span>
        </label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          disabled={isPending}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Location <span className="text-xs text-subtle font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Balboa Park, San Diego"
          disabled={isPending}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text placeholder-subtle outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-text mb-1.5">
          Description <span className="text-xs text-subtle font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details, what to bring, meetup point…"
          rows={4}
          disabled={isPending}
          className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm text-text placeholder-subtle outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 leading-relaxed disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!title.trim() || !scopeId || !startsAt || isPending || groups.length === 0}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creating…' : 'Create Event'}
        </button>
        <a
          href="/events"
          className="text-sm text-muted hover:text-text transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
