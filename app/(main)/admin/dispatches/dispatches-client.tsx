'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Send, EyeOff, Trash2, Check, X, ChevronDown } from 'lucide-react'
import {
  createDispatch,
  updateDispatch,
  publishDispatch,
  unpublishDispatch,
  deleteDispatch,
} from '../actions'

type DispatchRow = {
  id: string
  title: string
  excerpt: string | null
  audience_scope: 'circle' | 'hub' | 'nexus'
  audience_id: string
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  linked_task: { id: string; name: string } | null
}

type CommunityRole = 'host' | 'guide' | 'mentor'

const input = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50 placeholder:text-gray-400'
const lbl   = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

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

  const [title,  setTitle]  = useState(initial?.title ?? '')
  const [body,   setBody]   = useState('')   // body not returned in list query
  const [scope,  setScope]  = useState<'circle' | 'hub' | 'nexus'>(defaultScope as any)
  const [audId,  setAudId]  = useState(initial?.audience_id ?? '')
  const [taskId, setTaskId] = useState(initial?.linked_task?.id ?? '')
  const [preview, setPreview] = useState(false)

  const audienceOptions =
    scope === 'circle' ? circles :
    scope === 'hub'    ? hubs    : nexuses

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('title', title)
    fd.set('body', body)
    fd.set('audience_scope', scope)
    fd.set('audience_id', audId)
    fd.set('linked_task_id', taskId)
    onSave(fd)
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-5 mb-5 space-y-4">
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

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={lbl + ' mb-0'}>Body * <span className="text-gray-400 font-normal">(markdown supported)</span></label>
          <button
            type="button"
            onClick={() => setPreview(p => !p)}
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <div className="min-h-[160px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 prose-preview">
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

      {/* Scope + Audience */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Send to</label>
          <select
            value={scope}
            onChange={e => { setScope(e.target.value as any); setAudId('') }}
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
            <option value="">— Select —</option>
            {audienceOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Linked task */}
      {tasks.length > 0 && (
        <div>
          <label className={lbl}>Link a Challenge <span className="text-gray-400 font-normal">(optional)</span></label>
          <select
            value={taskId}
            onChange={e => setTaskId(e.target.value)}
            disabled={isPending}
            className={input}
          >
            <option value="">— None —</option>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim() || !body.trim() || !audId || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {isPending ? 'Saving…' : initial ? 'Save changes' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </form>
  )
}

// Lightweight inline markdown preview — no import needed
function MarkdownPreview({ text }: { text: string }) {
  if (!text.trim()) return <span className="text-gray-400 italic">Nothing to preview yet.</span>
  // Render as pre-wrap for now; the full react-markdown render is on the public page
  return <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
}

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  published: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
}

export function DispatchesClient({
  dispatches,
  role,
  circles,
  hubs,
  nexuses,
  tasks,
}: {
  dispatches: DispatchRow[]
  role: CommunityRole
  circles: { id: string; name: string }[]
  hubs:    { id: string; name: string }[]
  nexuses: { id: string; name: string }[]
  tasks:   { id: string; name: string }[]
}) {
  const [showCreate,  setShowCreate]  = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [isPending,   startTransition] = useTransition()

  function handleCreate(fd: FormData) {
    startTransition(async () => {
      await createDispatch(fd)
      setShowCreate(false)
    })
  }

  function handleUpdate(id: string, fd: FormData) {
    startTransition(async () => {
      await updateDispatch(id, fd)
      setEditingId(null)
    })
  }

  function handlePublish(id: string) {
    startTransition(async () => { await publishDispatch(id) })
  }

  function handleUnpublish(id: string) {
    startTransition(async () => { await unpublishDispatch(id) })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this dispatch permanently?')) return
    startTransition(async () => { await deleteDispatch(id) })
  }

  return (
    <div>
      {showCreate ? (
        <DispatchForm
          role={role} circles={circles} hubs={hubs} nexuses={nexuses} tasks={tasks}
          onSave={handleCreate} onCancel={() => setShowCreate(false)} isPending={isPending}
        />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="mb-5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New dispatch
        </button>
      )}

      <div className="space-y-2">
        {dispatches.length === 0 && !showCreate && (
          <p className="text-sm text-gray-400 py-8 text-center">No dispatches yet. Create your first one above.</p>
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
              <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link
                      href={`/broadcast/${d.id}`}
                      className="text-sm font-semibold text-gray-900 dark:text-gray-50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      {d.title}
                    </Link>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[d.status]}`}>
                      {d.status}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium capitalize">
                      → {d.audience_scope}
                    </span>
                  </div>
                  {d.excerpt && (
                    <p className="text-xs text-gray-400 line-clamp-1">{d.excerpt}</p>
                  )}
                  {d.linked_task && (
                    <p className="text-xs text-indigo-500 mt-0.5">Challenge: {d.linked_task.name}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                  {d.status === 'draft' ? (
                    <button
                      onClick={() => handlePublish(d.id)}
                      disabled={isPending}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-50 transition-colors"
                      aria-label="Publish"
                      title="Publish"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnpublish(d.id)}
                      disabled={isPending}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors"
                      aria-label="Unpublish"
                      title="Unpublish"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setEditingId(d.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
