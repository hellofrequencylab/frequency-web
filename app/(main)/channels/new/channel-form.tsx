'use client'

import { useState, useTransition } from 'react'
import { createChannel } from '@/app/(main)/channels/actions'

type ScopeOption = {
  scope: 'hub' | 'nexus' | 'outpost'
  scopeId: string
  label: string
}

export function ChannelForm({ scopeOptions }: { scopeOptions: ScopeOption[] }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedScope, setSelectedScope] = useState(scopeOptions[0]?.scope ?? 'hub')
  const [selectedScopeId, setSelectedScopeId] = useState(scopeOptions[0]?.scopeId ?? '')
  const [type, setType] = useState('group')
  const [isPublic, setIsPublic] = useState(true)
  const [eventDate, setEventDate] = useState('')

  function handleScopeChange(val: string) {
    const [scope, scopeId] = val.split('|')
    setSelectedScope(scope as any)
    setSelectedScopeId(scopeId)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !selectedScopeId || isPending) return

    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('description', description.trim())
    fd.set('scope', selectedScope)
    fd.set('scopeId', selectedScopeId)
    fd.set('type', type)
    fd.set('isPublic', String(isPublic))
    if (eventDate && type === 'event') fd.set('eventDate', eventDate)

    startTransition(async () => {
      await createChannel(fd)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Channel name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Wednesday Rides"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
        <div className="flex gap-2">
          {(['group', 'event', 'thread'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              disabled={isPending}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors capitalize ${
                type === t
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Scope */}
      {scopeOptions.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Visible to <span className="text-red-500">*</span>
          </label>
          <select
            value={`${selectedScope}|${selectedScopeId}`}
            onChange={(e) => handleScopeChange(e.target.value)}
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
          >
            {scopeOptions.map((opt) => (
              <option key={`${opt.scope}|${opt.scopeId}`} value={`${opt.scope}|${opt.scopeId}`}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Event date (only for event type) */}
      {type === 'event' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Event date</label>
          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
          />
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Description <span className="text-xs text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this channel for?"
          rows={3}
          disabled={isPending}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 leading-relaxed disabled:opacity-60"
        />
      </div>

      {/* Visibility */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic(!isPublic)}
          disabled={isPending}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            isPublic ? 'bg-indigo-600' : 'bg-gray-200'
          } disabled:opacity-60`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isPublic ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-sm text-gray-700">
          {isPublic ? 'Public — discoverable in your nexus' : 'Private — invite only'}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || !selectedScopeId || isPending}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creating…' : 'Create Channel'}
        </button>
        <a href="/channels" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </a>
      </div>
    </form>
  )
}
