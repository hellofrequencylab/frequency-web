'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Send, EyeOff, Trash2, Check, X, Clock } from 'lucide-react'
import {
  updateDispatch,
  publishDispatch,
  unpublishDispatch,
  deleteDispatch,
} from '../actions'
import { Button } from '@/components/ui/button'
import { StatusChip, type StatusTone, Banner } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { DangerModal } from '@/components/admin/danger-modal'

type DispatchType = 'post' | 'poll' | 'challenge' | 'article'

type DispatchRow = {
  id: string
  title: string
  body: string | null
  excerpt: string | null
  dispatch_type: DispatchType
  audience_scope: 'circle' | 'hub' | 'nexus'
  audience_id: string
  status: 'draft' | 'published'
  published_at: string | null
  scheduled_for: string | null
  created_at: string
  linked_task: { id: string; name: string } | null
}

const TYPE_LABELS: Record<DispatchType, string> = {
  post:      'Post',
  poll:      'Poll',
  challenge: 'Challenge',
  article:   'Article',
}

// Type → the shared StatusChip vocabulary (retired the local TYPE_COLORS dict).
const TYPE_TONE: Record<DispatchType, StatusTone> = {
  post:      'neutral',
  poll:      'info',
  challenge: 'warning',
  article:   'info',
}

type CommunityRole = 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30 disabled:opacity-50 placeholder:text-subtle'
const lbl   = 'block text-xs font-medium text-muted mb-1'

function DispatchForm({
  initial,
  role,
  circles,
  hubs,
  nexuses,
  tasks,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: DispatchRow
  role: CommunityRole
  circles: { id: string; name: string }[]
  hubs:    { id: string; name: string }[]
  nexuses: { id: string; name: string }[]
  tasks:   { id: string; name: string }[]
  onSave:    (fd: FormData) => void
  onCancel:  () => void
  isPending: boolean
}) {
  const defaultScope = initial?.audience_scope ??
    (role === 'mentor' && nexuses.length > 0 ? 'nexus' :
     role === 'guide'  && hubs.length > 0    ? 'hub'   : 'circle')

  const [title,        setTitle]        = useState(initial?.title ?? '')
  // Seed the body from the existing dispatch on Edit (the textarea is `required`, so an
  // empty seed left Save disabled and any save overwrote the original with blank).
  const [body,         setBody]         = useState(initial?.body ?? '')
  const [dispatchType, setDispatchType] = useState<DispatchType>(initial?.dispatch_type ?? 'post')
  const [scope,        setScope]        = useState<'circle' | 'hub' | 'nexus'>(defaultScope as 'circle' | 'hub' | 'nexus')
  const [audId,        setAudId]        = useState(initial?.audience_id ?? '')
  const [taskId,       setTaskId]       = useState(initial?.linked_task?.id ?? '')
  const [preview,      setPreview]      = useState(false)
  const [scheduledFor, setScheduledFor] = useState(initial?.scheduled_for ? initial.scheduled_for.slice(0, 16) : '')
  const [pollOptions,  setPollOptions]  = useState<string[]>(['', ''])

  const audienceOptions =
    scope === 'circle' ? circles :
    scope === 'hub'    ? hubs    : nexuses

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('title', title)
    fd.set('body', body)
    fd.set('dispatch_type', dispatchType)
    fd.set('audience_scope', scope)
    fd.set('audience_id', audId)
    fd.set('linked_task_id', taskId)
    if (scheduledFor) fd.set('scheduled_for', scheduledFor)
    if (dispatchType === 'poll') fd.set('poll_options', JSON.stringify(pollOptions))
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-primary-bg bg-primary-bg/40 dark:bg-primary-bg p-5 mb-5 space-y-4">
      {/* Title */}
      <div>
        <label className={lbl}>Title *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. This Week's Challenges Are Live"
          required
          disabled={isPending}
          className={input}
        />
      </div>

      {/* Type */}
      <div>
        <label className={lbl}>Type</label>
        <div className="flex gap-2 flex-wrap">
          {(['post', 'poll', 'challenge', 'article'] as DispatchType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setDispatchType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                dispatchType === t
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-text hover:border-primary'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={lbl + ' mb-0'}>Body * <span className="text-subtle font-normal">(markdown supported)</span></label>
          <button
            type="button"
            onClick={() => setPreview(p => !p)}
            className="text-xs text-primary-strong hover:text-primary-strong transition-colors"
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[160px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text prose-preview">
            <MarkdownPreview text={body} />
          </div>
        ) : (
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={`**Bold text**, *italic*, [links](https://...)\n\n- List item one\n- List item two`}
            rows={8}
            required
            disabled={isPending}
            className={`${input} resize-y font-mono text-xs leading-relaxed`}
          />
        )}
      </div>

      {/* Poll options. Only when type=poll */}
      {dispatchType === 'poll' && (
        <div>
          <label className={lbl}>Poll Options <span className="text-subtle font-normal">(min 2)</span></label>
          <div className="space-y-2">
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={e => {
                    const next = [...pollOptions]
                    next[i] = e.target.value
                    setPollOptions(next)
                  }}
                  placeholder={`Option ${i + 1}`}
                  disabled={isPending}
                  className={input}
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                    className="shrink-0 p-1 text-subtle hover:text-danger transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && (
              <button
                type="button"
                onClick={() => setPollOptions([...pollOptions, ''])}
                className="text-xs text-primary-strong hover:text-primary-strong flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add option
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scope + Audience */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Send to</label>
          <select
            value={scope}
            onChange={e => { setScope(e.target.value as 'circle' | 'hub' | 'nexus'); setAudId('') }}
            disabled={isPending}
            className={input}
          >
            {circles.length > 0  && <option value="circle">Circle</option>}
            {hubs.length > 0     && <option value="hub">Hub</option>}
            {nexuses.length > 0  && <option value="nexus">Nexus</option>}
          </select>
        </div>
        <div>
          <label className={lbl}>Which {scope}</label>
          <select
            value={audId}
            onChange={e => setAudId(e.target.value)}
            required
            disabled={isPending}
            className={input}
          >
            <option value="">- Select -</option>
            {audienceOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Linked task */}
      {tasks.length > 0 && (
        <div>
          <label className={lbl}>Link a Challenge <span className="text-subtle font-normal">(optional)</span></label>
          <select
            value={taskId}
            onChange={e => setTaskId(e.target.value)}
            disabled={isPending}
            className={input}
          >
            <option value="">- None -</option>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Schedule (optional) */}
      <div>
        <label className={lbl}>
          <Clock className="w-3 h-3 inline mr-1" />
          Schedule publish <span className="text-subtle font-normal">(optional. Leave blank to save as draft)</span>
        </label>
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={e => setScheduledFor(e.target.value)}
          disabled={isPending}
          className={input}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || !body.trim() || !audId || isPending}
        >
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Save draft'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Lightweight inline markdown preview. No import needed
function MarkdownPreview({ text }: { text: string }) {
  if (!text.trim()) return <span className="text-subtle italic">Nothing to preview yet.</span>
  // Render as pre-wrap for now; the full react-markdown render is on the public page
  return <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
}

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  published: 'success',
}

export function DispatchesClient({
  dispatches,
  role,
  circles,
  hubs,
  nexuses,
  tasks,
  initialEditId = null,
}: {
  dispatches: DispatchRow[]
  role: CommunityRole
  circles: { id: string; name: string }[]
  hubs:    { id: string; name: string }[]
  nexuses: { id: string; name: string }[]
  tasks:   { id: string; name: string }[]
  /** ?edit=<id> deep-link from the "Edit broadcast" button on the broadcast page. */
  initialEditId?: string | null
}) {
  const [editingId,   setEditingId]   = useState<string | null>(
    initialEditId && dispatches.some((d) => d.id === initialEditId) ? initialEditId : null,
  )
  const [isPending,   startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DispatchRow | null>(null)

  function handleUpdate(id: string, fd: FormData) {
    setActionError(null)
    startTransition(async () => {
      try {
        await updateDispatch(id, fd)
        setEditingId(null)
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Failed to update dispatch.')
      }
    })
  }

  function handlePublish(id: string) {
    setActionError(null)
    startTransition(async () => {
      try { await publishDispatch(id) }
      catch (e) { setActionError(e instanceof Error ? e.message : 'Failed to publish.') }
    })
  }

  function handleUnpublish(id: string) {
    setActionError(null)
    startTransition(async () => {
      try { await unpublishDispatch(id) }
      catch (e) { setActionError(e instanceof Error ? e.message : 'Failed to unpublish.') }
    })
  }

  function handleDelete(id: string) {
    setActionError(null)
    startTransition(async () => {
      try { await deleteDispatch(id) }
      catch (e) { setActionError(e instanceof Error ? e.message : 'Failed to delete.') }
    })
  }

  return (
    <div>
      {actionError && (
        <div className="mb-4">
          <Banner tone="critical" title="That action could not be completed" dismissible>
            {actionError}
          </Banner>
        </div>
      )}
      <div className="space-y-2">
        {dispatches.length === 0 && (
          <EmptyState
            variant="first-use"
            title="No Dispatches yet"
            description="Publish an announcement to reach your people. It appears on the Dispatches page and drops into the main feed."
          />
        )}

        {dispatches.map(d => (
          <div key={d.id}>
            {editingId === d.id ? (
              <DispatchForm
                initial={d}
                role={role} circles={circles} hubs={hubs} nexuses={nexuses} tasks={tasks}
                onSave={(fd) => handleUpdate(d.id, fd)}
                onCancel={() => setEditingId(null)}
                isPending={isPending}
              />
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link
                      href={`/broadcast/${d.id}`}
                      className="text-sm font-semibold text-text hover:text-primary-strong dark:hover:text-primary-strong transition-colors"
                    >
                      {d.title}
                    </Link>
                    <StatusChip tone={STATUS_TONE[d.status] ?? 'neutral'} size="sm">
                      <span className="capitalize">{d.status}</span>
                    </StatusChip>
                    {d.dispatch_type && (
                      <StatusChip tone={TYPE_TONE[d.dispatch_type]} size="sm">
                        {TYPE_LABELS[d.dispatch_type]}
                      </StatusChip>
                    )}
                    <StatusChip tone="neutral" size="sm">
                      <span className="capitalize">→ {d.audience_scope}</span>
                    </StatusChip>
                  </div>
                  {d.excerpt && (
                    <p className="text-xs text-subtle line-clamp-1">{d.excerpt}</p>
                  )}
                  {d.linked_task && (
                    <p className="text-xs text-primary-strong mt-0.5">Challenge: {d.linked_task.name}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                  {d.status === 'draft' ? (
                    <button
                      onClick={() => handlePublish(d.id)}
                      disabled={isPending}
                      className="p-1.5 rounded-lg text-subtle hover:text-success hover:bg-success-bg dark:hover:bg-success-bg/30 disabled:opacity-50 transition-colors"
                      aria-label="Publish"
                      title="Publish"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnpublish(d.id)}
                      disabled={isPending}
                      className="p-1.5 rounded-lg text-subtle hover:text-warning hover:bg-warning-bg dark:hover:bg-warning-bg/30 disabled:opacity-50 transition-colors"
                      aria-label="Unpublish"
                      title="Unpublish"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setEditingId(d.id)}
                    className="p-1.5 rounded-lg text-subtle hover:text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(d)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-subtle hover:text-danger hover:bg-danger-bg disabled:opacity-50 transition-colors motion-reduce:transition-none"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <DangerModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this Dispatch?"
        body={
          <>
            Deleting <span className="font-semibold text-text">{confirmDelete?.title}</span> removes it permanently. This cannot be undone.
          </>
        }
        confirmLabel="Delete Dispatch"
        onConfirm={() => {
          if (confirmDelete) handleDelete(confirmDelete.id)
        }}
      />
    </div>
  )
}
