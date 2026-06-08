'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Lock, Sparkles, Wand2 } from 'lucide-react'
import { setTicketFields, staffReply, draftReply, suggestTriage } from '@/app/(main)/admin/support/actions'
import {
  TICKET_STATUSES, TICKET_PRIORITIES, STATUS_LABELS, PRIORITY_LABELS,
  type TicketStatus, type TicketPriority, type TicketParty,
} from '@/lib/support/types'

// Staff triage controls for one ticket: status / priority / assignee selects, plus a
// reply composer that can send a public reply OR file an internal note.
export function AdminTicketControls({
  ticketId,
  status,
  priority,
  assignedTo,
  agents,
}: {
  ticketId: string
  status: TicketStatus
  priority: TicketPriority
  assignedTo: string | null
  agents: TicketParty[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafting, startDraft] = useTransition()
  const [aiDrafted, setAiDrafted] = useState(false)
  const [triaging, startTriage] = useTransition()
  const [triageNote, setTriageNote] = useState<string | null>(null)

  function triage() {
    if (triaging) return
    setError(null)
    startTriage(async () => {
      const r = await suggestTriage(ticketId)
      if ('error' in r) { setError(r.error); return }
      setTriageNote(`Priority → ${r.data.priority} · ${r.data.reason}`)
      router.refresh()
    })
  }

  function draft() {
    if (drafting) return
    setError(null)
    startDraft(async () => {
      const r = await draftReply(ticketId)
      if ('error' in r) { setError(r.error); return }
      setBody(r.data.draft)
      setInternal(false)
      setAiDrafted(true)
    })
  }

  function patch(p: { status?: TicketStatus; priority?: TicketPriority; assignedTo?: string | null }) {
    start(async () => {
      const r = await setTicketFields(ticketId, p)
      if ('error' in r) { setError(r.error); return }
      router.refresh()
    })
  }

  function reply() {
    const text = body.trim()
    if (!text || pending) return
    setError(null)
    start(async () => {
      const r = await staffReply(ticketId, text, internal)
      if ('error' in r) { setError(r.error); return }
      setBody('')
      router.refresh()
    })
  }

  const sel = 'w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none'
  const lbl = 'mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={triage}
          disabled={triaging || pending}
          title="Let AI classify this ticket's priority"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
        >
          {triaging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          AI triage
        </button>
        {triageNote && <span className="text-2xs text-subtle">✨ {triageNote}</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={lbl}>Status</span>
          <select className={sel} value={status} disabled={pending} onChange={(e) => patch({ status: e.target.value as TicketStatus })}>
            {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Priority</span>
          <select className={sel} value={priority} disabled={pending} onChange={(e) => patch({ priority: e.target.value as TicketPriority })}>
            {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Assignee</span>
          <select className={sel} value={assignedTo ?? ''} disabled={pending} onChange={(e) => patch({ assignedTo: e.target.value || null })}>
            <option value="">Unassigned</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center gap-1 rounded-lg bg-surface-elevated p-0.5 text-xs">
          <button type="button" onClick={() => setInternal(false)} aria-pressed={!internal} className={`flex-1 rounded-md px-2 py-1 font-semibold transition-colors ${!internal ? 'bg-surface text-primary-strong shadow-sm' : 'text-muted'}`}>
            Reply to member
          </button>
          <button type="button" onClick={() => setInternal(true)} aria-pressed={internal} className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 font-semibold transition-colors ${internal ? 'bg-surface text-warning shadow-sm' : 'text-muted'}`}>
            <Lock className="h-3 w-3" /> Internal note
          </button>
        </div>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setAiDrafted(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) reply() }}
          rows={3}
          placeholder={internal ? 'A note only staff can see…' : 'Reply to the member…'}
          className="w-full resize-none rounded-lg border border-border bg-canvas px-3 py-2 text-sm leading-relaxed text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
        />
        {aiDrafted && <p className="mt-1 text-2xs text-subtle">✨ AI draft — review and edit before sending.</p>}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={draft} disabled={drafting || pending} title="Draft a reply with AI (you review before sending)" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50">
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI draft
          </button>
          <button type="button" onClick={reply} disabled={pending || !body.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {internal ? 'Add note' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  )
}
