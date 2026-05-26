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
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Event title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Wednesday Morning Ride"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
      </div>

      {/* Group */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Group <span className="text-red-500">*</span>
        </label>
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">You must be in a group to create an event.</p>
        ) : (
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
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
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Starts at <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
          disabled={isPending}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
      </div>

      {/* End */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Ends at <span className="text-xs text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          disabled={isPending}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Location <span className="text-xs text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Balboa Park, San Diego"
          disabled={isPending}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Description <span className="text-xs text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details, what to bring, meetup point…"
          rows={4}
          disabled={isPending}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 leading-relaxed disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!title.trim() || !scopeId || !startsAt || isPending || groups.length === 0}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creating…' : 'Create Event'}
        </button>
        <a
          href="/events"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
