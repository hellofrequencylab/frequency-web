'use client'

// The docked composer for one conversation (ADR-812 Phase 3): a Reply / Note segmented toggle, the body
// field, an optional "Draft with Vera" affordance (Phase 5), and the gated Send. A public reply enqueues
// an outbound email that threads back to this conversation; an internal note is staff-only. The reply +
// draft actions are INJECTED (default to the operator actions) so the same composer serves the operator
// inbox and the leader inbox.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Send, Sparkles } from 'lucide-react'
import { isError, type ActionResult } from '@/lib/action-result'
import { sendConversationReply } from '@/app/(main)/admin/crm/conversations/actions'
import { Textarea } from '@/components/ui/field'

type SendAction = (input: { conversationId: string; body: string; isInternal?: boolean }) => Promise<ActionResult>
type DraftAction = (conversationId: string) => Promise<ActionResult<{ draft: string }>>

export function ConversationComposer({
  conversationId,
  counterpartName,
  sendAction = sendConversationReply,
  draftAction,
}: {
  conversationId: string
  counterpartName: string | null
  /** The gated reply action (defaults to the operator action; the leader inbox injects its own). */
  sendAction?: SendAction
  /** Optional "Draft with Vera" action; the button only shows when it is provided. */
  draftAction?: DraftAction
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [drafting, startDraft] = useTransition()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiDrafted, setAiDrafted] = useState(false)

  function submit() {
    const text = body.trim()
    if (!text || pending) return
    setError(null)
    start(async () => {
      // A rejected action promise (server timeout, a redeploy invalidating the action reference, a
      // dropped connection) must NOT escape this transition — an uncaught rejection here bubbles to
      // the admin error boundary and takes down the whole workspace. Catch it and fail inline.
      let res: ActionResult
      try {
        res = await sendAction({ conversationId, body: text, isInternal: internal })
      } catch {
        setError(
          internal
            ? 'Could not save the note. Your text is still here. Try again.'
            : 'Could not send the reply. Your text is still here. Try again.',
        )
        return
      }
      if (isError(res)) {
        setError(res.error)
        return
      }
      setBody('')
      setAiDrafted(false)
      router.refresh()
    })
  }

  function draft() {
    if (!draftAction || drafting) return
    setError(null)
    startDraft(async () => {
      // Same guard as submit(): drafting calls a model server-side, so this is the request most
      // likely to time out. A rejection renders inline; the thread and the page stay up.
      let res: ActionResult<{ draft: string }>
      try {
        res = await draftAction(conversationId)
      } catch {
        setError('Vera could not draft a reply right now. The thread is fine. Try again in a moment.')
        return
      }
      if (isError(res)) {
        setError(res.error)
        return
      }
      setBody(res.data.draft)
      setInternal(false)
      setAiDrafted(true)
    })
  }

  return (
    <div className="border-t border-border p-3">
      <div className="mb-2 flex items-center gap-1 rounded-lg bg-surface-elevated p-0.5 text-meta">
        <button
          type="button"
          onClick={() => setInternal(false)}
          aria-pressed={!internal}
          className={`flex-1 rounded-md px-2 py-1 font-semibold transition-colors ${
            !internal ? 'bg-surface text-primary-strong lift-1' : 'text-muted'
          }`}
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => setInternal(true)}
          aria-pressed={internal}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 font-semibold transition-colors ${
            internal ? 'bg-surface text-warning lift-1' : 'text-muted'
          }`}
        >
          <Lock className="h-3 w-3" /> Note
        </button>
      </div>

      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setAiDrafted(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
        rows={3}
        placeholder={internal ? 'A note only your team can see...' : `Reply to ${counterpartName || 'them'}...`}
        aria-label={internal ? 'Internal note' : 'Reply'}
        className="resize-none leading-relaxed"
      />
      {aiDrafted && <p className="mt-1 text-2xs text-muted">Vera drafted this. Read it and edit before you send.</p>}
      {error && (
        <p role="alert" className="mt-1 text-meta text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        {draftAction && !internal ? (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending}
            title="Draft a reply with Vera (you review before sending)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
          >
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Draft with Vera
          </button>
        ) : (
          <p className="text-2xs text-muted">
            {internal ? 'Only your team sees notes.' : 'Their reply comes back to this thread. Opt-outs are honored.'}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending || !body.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {internal ? 'Add note' : 'Send reply'}
        </button>
      </div>
    </div>
  )
}
