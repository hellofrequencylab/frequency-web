'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Check, Loader2 } from 'lucide-react'
import { createAndPublishDispatch } from './actions'

type DispatchType = 'post' | 'poll' | 'challenge' | 'article'
const TYPE_LABELS: Record<DispatchType, string> = { post: 'Post', poll: 'Poll', challenge: 'Challenge', article: 'Article' }

const input = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50 placeholder:text-gray-400'
const lbl   = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

export function BroadcastCompose({
  circles,
  hubs,
  nexuses,
}: {
  circles: { id: string; name: string }[]
  hubs:    { id: string; name: string }[]
  nexuses: { id: string; name: string }[]
}) {
  const [open,         setOpen]         = useState(false)
  const [title,        setTitle]        = useState('')
  const [body,         setBody]         = useState('')
  const [type,         setType]         = useState<DispatchType>('post')
  const [scope,        setScope]        = useState<'circle' | 'hub' | 'nexus'>(
    nexuses.length > 0 ? 'nexus' : hubs.length > 0 ? 'hub' : 'circle'
  )
  const [audId,        setAudId]        = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()

  const audienceOptions = scope === 'circle' ? circles : scope === 'hub' ? hubs : nexuses

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('title',          title)
    fd.set('body',           body)
    fd.set('dispatch_type',  type)
    fd.set('audience_scope', scope)
    fd.set('audience_id',    audId)
    startTransition(async () => {
      try {
        await createAndPublishDispatch(fd)
        setOpen(false)
        setTitle('')
        setBody('')
        setAudId('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to publish.')
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Dispatch
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-5 mb-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">New Dispatch</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>
      )}

      <div>
        <label className={lbl}>Title *</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. This Week's Highlights" required disabled={isPending} className={input} />
      </div>

      <div>
        <label className={lbl}>Type</label>
        <div className="flex gap-2 flex-wrap">
          {(['post', 'poll', 'challenge', 'article'] as DispatchType[]).map(t => (
            <button
              key={t} type="button" onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                type === t
                  ? 'border-indigo-400 bg-indigo-600 text-white'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-indigo-300'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={lbl}>Body * <span className="text-gray-400 font-normal">(markdown supported)</span></label>
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          placeholder="Write your dispatch…" rows={6} required disabled={isPending}
          className={`${input} resize-y font-mono text-xs leading-relaxed`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Send to</label>
          <select value={scope} onChange={e => { setScope(e.target.value as any); setAudId('') }} disabled={isPending} className={input}>
            {circles.length > 0  && <option value="circle">Circle</option>}
            {hubs.length > 0     && <option value="hub">Hub</option>}
            {nexuses.length > 0  && <option value="nexus">Nexus</option>}
          </select>
        </div>
        <div>
          <label className={lbl}>Which {scope}</label>
          <select value={audId} onChange={e => setAudId(e.target.value)} required disabled={isPending} className={input}>
            <option value="">— Select —</option>
            {audienceOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim() || !body.trim() || !audId || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {isPending ? 'Publishing…' : 'Publish now'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
