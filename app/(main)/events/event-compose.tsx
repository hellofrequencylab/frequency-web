'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Check, Loader2, CalendarDays } from 'lucide-react'
import { createEvent } from './actions'

type Group = { id: string; name: string }

const input = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50 placeholder:text-gray-400'
const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

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

  function submit(e: React.FormEvent) {
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
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        New Event
      </button>

      {open && (
        <div
          onClick={() => !isPending && setOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={submit}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl my-8 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">New Event</h2>
              </div>
              <button type="button" onClick={() => !isPending && setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
              {error && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>
              )}

              {groups.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">You must be in a circle to create an event.</p>
              ) : (
                <>
                  <div>
                    <label className={lbl}>Event title *</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wednesday Morning Ride" required disabled={isPending} className={input} />
                  </div>

                  <div>
                    <label className={lbl}>Circle *</label>
                    <select value={scopeId} onChange={e => setScopeId(e.target.value)} required disabled={isPending} className={input}>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Starts at *</label>
                      <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required disabled={isPending} className={input} />
                    </div>
                    <div>
                      <label className={lbl}>Ends at <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} disabled={isPending} className={input} />
                    </div>
                  </div>

                  <div>
                    <label className={lbl}>Location <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Balboa Park, San Diego" disabled={isPending} className={input} />
                  </div>

                  <div>
                    <label className={lbl}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details, what to bring, meetup point…" rows={4} disabled={isPending} className={`${input} resize-y leading-relaxed`} />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-2xl">
              <button type="button" onClick={() => !isPending && setOpen(false)} disabled={isPending} className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !scopeId || !startsAt || isPending || groups.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {isPending ? 'Creating…' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
