'use client'

import { useState, useTransition } from 'react'
import { Plus, Megaphone } from 'lucide-react'
import { createAndPublishDispatch } from './actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

type DispatchType = 'post' | 'poll' | 'challenge' | 'article'
const TYPE_LABELS: Record<DispatchType, string> = {
  post: 'Post', poll: 'Poll', challenge: 'Challenge', article: 'Article',
}

type Scope = 'circle' | 'hub' | 'nexus' | 'global'

export function BroadcastCompose({
  circles,
  hubs,
  nexuses,
  canGlobal = false,
}: {
  circles: { id: string; name: string }[]
  hubs:    { id: string; name: string }[]
  nexuses: { id: string; name: string }[]
  /** Staff/janitor may broadcast to Everyone (Phase D). */
  canGlobal?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<DispatchType>('post')
  const [scope, setScope] = useState<Scope>(
    nexuses.length > 0 ? 'nexus' : hubs.length > 0 ? 'hub' : circles.length > 0 ? 'circle' : 'global'
  )
  const [audId, setAudId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const audienceOptions = scope === 'circle' ? circles : scope === 'hub' ? hubs : scope === 'nexus' ? nexuses : []

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('title', title)
    fd.set('body', body)
    fd.set('dispatch_type', type)
    fd.set('audience_scope', scope)
    fd.set('audience_id', audId)
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        New Broadcast
      </button>

      <CreateModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        title="New Broadcast"
        titleIcon={Megaphone}
        titleIconColor="indigo"
        submitLabel="Publish now"
        pendingLabel="Publishing…"
        submitDisabled={!title.trim() || !body.trim() || (scope !== 'global' && !audId)}
        isPending={isPending}
        error={error}
      >
        <div>
          <label className={cmLabel}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. This Week's Highlights"
            required
            disabled={isPending}
            className={cmInput}
          />
        </div>

        <div>
          <label className={cmLabel}>Type</label>
          <div className="flex gap-2 flex-wrap">
            {(['post', 'poll', 'challenge', 'article'] as DispatchType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  type === t
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-surface text-text hover:border-primary'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={cmLabel}>
            Body * <span className="text-subtle font-normal">(markdown supported)</span>
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your broadcast…"
            rows={8}
            required
            disabled={isPending}
            className={`${cmInput} resize-y font-mono text-xs leading-relaxed`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={cmLabel}>Send to</label>
            <select
              value={scope}
              onChange={e => { setScope(e.target.value as Scope); setAudId('') }}
              disabled={isPending}
              className={cmInput}
            >
              {circles.length > 0 && <option value="circle">Circle</option>}
              {hubs.length > 0 && <option value="hub">Hub</option>}
              {nexuses.length > 0 && <option value="nexus">Nexus</option>}
              {canGlobal && <option value="global">Everyone (Global)</option>}
            </select>
          </div>
          {scope !== 'global' ? (
            <div>
              <label className={cmLabel}>Which {scope}</label>
              <select
                value={audId}
                onChange={e => setAudId(e.target.value)}
                required
                disabled={isPending}
                className={cmInput}
              >
                <option value="">- Select -</option>
                {audienceOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-end">
              <p className="text-xs text-subtle">Reaches every member, site-wide.</p>
            </div>
          )}
        </div>
      </CreateModal>
    </>
  )
}
