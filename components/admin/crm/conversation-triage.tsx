'use client'

// Triage controls for one conversation (ADR-812 Phase 3): status / priority / assignee, plus the optional
// Vera affordances (summarize, suggest priority). COLLAPSED by default to a slim summary bar so the reader
// stays clean; the operator expands it only to change something. The triage action is INJECTED (default
// operator) so the leader / Space inboxes reuse this with their own gate.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, Wand2, SlidersHorizontal, ChevronUp } from 'lucide-react'
import { isError, type ActionResult } from '@/lib/action-result'
import { setConversationTriage } from '@/app/(main)/admin/crm/conversations/actions'
import { CONVERSATION_STATUSES, CONVERSATION_PRIORITIES, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/comms/labels'

export interface TriageAgent {
  id: string
  name: string
}

type TriageAction = (input: {
  conversationId: string
  status?: string
  priority?: string
  assignedTo?: string | null
  handoffNote?: string | null
}) => Promise<ActionResult>
type SummarizeAction = (conversationId: string) => Promise<ActionResult<{ summary: string }>>
type AiTriageAction = (conversationId: string) => Promise<ActionResult<{ priority: string; reason: string }>>

export function ConversationTriage({
  conversationId,
  status,
  priority,
  assignedTo,
  agents,
  triageAction = setConversationTriage,
  summarizeAction,
  aiTriageAction,
}: {
  conversationId: string
  status: string
  priority: string
  assignedTo: string | null
  agents: TriageAgent[]
  triageAction?: TriageAction
  summarizeAction?: SummarizeAction
  aiTriageAction?: AiTriageAction
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [aiPending, startAi] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [handoff, setHandoff] = useState('')
  const [tradeTo, setTradeTo] = useState<string | null | undefined>(undefined)

  const assigneeName = assignedTo ? (agents.find((a) => a.id === assignedTo)?.name ?? 'Assigned') : 'Unassigned'

  function patch(p: { status?: string; priority?: string; assignedTo?: string | null; handoffNote?: string | null }) {
    if (pending) return
    setError(null)
    start(async () => {
      // A rejected action promise (server timeout, a redeploy invalidating the action reference, a
      // dropped connection) must NOT escape this transition — an uncaught rejection here bubbles to
      // the admin error boundary and takes down the whole workspace. Catch it and fail inline.
      let r: ActionResult
      try {
        r = await triageAction({ conversationId, ...p })
      } catch {
        setError('That change did not save. Try again.')
        return
      }
      if (isError(r)) {
        setError(r.error)
        return
      }
      setTradeTo(undefined)
      setHandoff('')
      router.refresh()
    })
  }

  function summarize() {
    if (!summarizeAction || aiPending) return
    setError(null)
    startAi(async () => {
      // Same guard as patch(): the summary calls a model server-side, the slowest kind of action.
      let r: ActionResult<{ summary: string }>
      try {
        r = await summarizeAction(conversationId)
      } catch {
        return setError('Could not summarize right now. Try again in a moment.')
      }
      if (isError(r)) return setError(r.error)
      setNote(r.data.summary)
    })
  }

  function aiTriage() {
    if (!aiTriageAction || aiPending) return
    setError(null)
    startAi(async () => {
      // Same guard as patch(): a rejection renders inline; the thread and the page stay up.
      let r: ActionResult<{ priority: string; reason: string }>
      try {
        r = await aiTriageAction(conversationId)
      } catch {
        return setError('Could not suggest a priority right now. Try again in a moment.')
      }
      if (isError(r)) return setError(r.error)
      setNote(`Priority set to ${r.data.priority}. ${r.data.reason}`)
      router.refresh()
    })
  }

  const sel =
    'rounded-lg border border-border bg-canvas px-2 py-1 text-xs text-text focus:border-border-strong focus:outline-none'
  const stagingTrade = tradeTo !== undefined && (tradeTo || null) !== assignedTo

  // ── Collapsed: a slim one-line summary + a Manage toggle. The default, so the reader stays clean.
  if (!open) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
        <p className="truncate text-2xs text-muted">
          {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
          <span className="text-subtle"> · {PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority}</span>
          <span className="text-subtle"> · {assigneeName}</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold text-muted hover:bg-surface-elevated hover:text-text"
        >
          <SlidersHorizontal className="h-3 w-3" /> Manage
        </button>
      </div>
    )
  }

  // ── Expanded: the full controls (only while the operator is triaging).
  return (
    <div className="space-y-2 border-t border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Manage thread</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded={true}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold text-muted hover:bg-surface-elevated hover:text-text"
        >
          <ChevronUp className="h-3 w-3" /> Done
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <select className={sel} value={status} disabled={pending} onChange={(e) => patch({ status: e.target.value })} aria-label="Status">
          {CONVERSATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className={sel} value={priority} disabled={pending} onChange={(e) => patch({ priority: e.target.value })} aria-label="Priority">
          {CONVERSATION_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={tradeTo === undefined ? (assignedTo ?? '') : (tradeTo ?? '')}
          disabled={pending}
          onChange={(e) => setTradeTo(e.target.value || null)}
          aria-label="Assignee"
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {stagingTrade && (
        <div className="flex items-center gap-2">
          <input
            value={handoff}
            onChange={(e) => setHandoff(e.target.value)}
            placeholder="Handoff note (optional)"
            className={`${sel} flex-1`}
          />
          <button
            type="button"
            onClick={() => patch({ assignedTo: tradeTo ?? null, handoffNote: handoff })}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {tradeTo ? 'Trade' : 'Unassign'}
          </button>
        </div>
      )}

      {(summarizeAction || aiTriageAction) && (
        <div className="flex flex-wrap items-center gap-2">
          {summarizeAction && (
            <button type="button" onClick={summarize} disabled={aiPending || pending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-50">
              {aiPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Summarize
            </button>
          )}
          {aiTriageAction && (
            <button type="button" onClick={aiTriage} disabled={aiPending || pending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-50">
              {aiPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Suggest priority
            </button>
          )}
          {note && <span className="text-2xs text-muted">{note}</span>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
