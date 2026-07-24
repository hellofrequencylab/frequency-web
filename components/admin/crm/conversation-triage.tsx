'use client'

// Triage controls for one conversation (ADR-812 Phase 3): status / priority / assignee. Changing the
// assignee is the "trade" (an assignment-audit row + an optional handoff note). Optional Vera affordances
// (Phase 5): a one-line thread summary and an AI priority suggestion. The triage action is INJECTED
// (default operator) so the leader inbox can reuse this with its own gate.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
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
  /** Optional "Summarize with Vera"; button shows only when provided. */
  summarizeAction?: SummarizeAction
  /** Optional "Suggest priority with Vera"; button shows only when provided. */
  aiTriageAction?: AiTriageAction
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aiPending, startAi] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [handoff, setHandoff] = useState('')
  const [tradeTo, setTradeTo] = useState<string | null | undefined>(undefined)

  function patch(p: { status?: string; priority?: string; assignedTo?: string | null; handoffNote?: string | null }) {
    if (pending) return
    setError(null)
    start(async () => {
      const r = await triageAction({ conversationId, ...p })
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
      const r = await summarizeAction(conversationId)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setNote(r.data.summary)
    })
  }

  function aiTriage() {
    if (!aiTriageAction || aiPending) return
    setError(null)
    startAi(async () => {
      const r = await aiTriageAction(conversationId)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setNote(`Priority set to ${r.data.priority}. ${r.data.reason}`)
      router.refresh()
    })
  }

  const sel =
    'w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none'
  const lbl = 'mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle'
  const stagingTrade = tradeTo !== undefined && (tradeTo || null) !== assignedTo

  return (
    <div className="space-y-3 border-t border-border p-3">
      {(summarizeAction || aiTriageAction) && (
        <div className="flex flex-wrap items-center gap-2">
          {summarizeAction && (
            <button
              type="button"
              onClick={summarize}
              disabled={aiPending || pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
            >
              {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Summarize
            </button>
          )}
          {aiTriageAction && (
            <button
              type="button"
              onClick={aiTriage}
              disabled={aiPending || pending}
              title="Let Vera suggest a priority"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
            >
              {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Suggest priority
            </button>
          )}
          {note && <span className="text-2xs text-subtle">{note}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={lbl}>Status</span>
          <select className={sel} value={status} disabled={pending} onChange={(e) => patch({ status: e.target.value })}>
            {CONVERSATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Priority</span>
          <select className={sel} value={priority} disabled={pending} onChange={(e) => patch({ priority: e.target.value })}>
            {CONVERSATION_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Assignee</span>
          <select
            className={sel}
            value={tradeTo === undefined ? (assignedTo ?? '') : (tradeTo ?? '')}
            disabled={pending}
            onChange={(e) => setTradeTo(e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {stagingTrade && (
        <div className="rounded-lg border border-border bg-surface-elevated p-2.5">
          <label className="block">
            <span className={lbl}>Handoff note (optional)</span>
            <input
              value={handoff}
              onChange={(e) => setHandoff(e.target.value)}
              placeholder="Context for whoever picks this up..."
              className={sel}
            />
          </label>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setTradeTo(undefined)
                setHandoff('')
              }}
              disabled={pending}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => patch({ assignedTo: tradeTo ?? null, handoffNote: handoff })}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {tradeTo ? 'Trade' : 'Unassign'}
            </button>
          </div>
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
