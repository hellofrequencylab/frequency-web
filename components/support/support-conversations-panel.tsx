'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { Textarea } from '@/components/ui/field'
import { ChatComposer } from '@/components/ui/chat-composer'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'
import {
  startMySupportRequestAction,
  listMySupportRequestsAction,
  loadMySupportThreadAction,
  postMySupportReplyAction,
} from '@/app/(main)/support/chat-actions'

// The member's support CONVERSATIONS inside the dock's Help & support section (chat consolidation).
// A member sends a "message us" request that becomes a ticketed spine conversation bound to their
// profile; the operator answers it in the CRM Conversations workspace, and the reply threads back here.
// Two views: the list of the member's requests (with a composer to start a new one), and one open thread.

type Thread = { ref: string; subject: string; status: string; lastAt: string }
type Msg = { id: string; author: 'visitor' | 'staff' | 'system'; body: string; at: string }

const STATUS_COPY: Record<string, string> = {
  open: 'Open', in_progress: 'In progress', waiting: 'Waiting on us', snoozed: 'Snoozed',
  resolved: 'Resolved', closed: 'Closed',
}

export function SupportConversationsPanel() {
  const [view, setView] = useState<'list' | 'thread'>('list')
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [openRef, setOpenRef] = useState<string | null>(null)

  const refreshList = () => {
    void listMySupportRequestsAction().then((res) => {
      setThreads(isError(res) ? [] : res.data.threads)
    })
  }
  useEffect(() => { refreshList() }, [])

  if (view === 'thread' && openRef) {
    return <SupportThread refId={openRef} onBack={() => { setView('list'); setOpenRef(null); refreshList() }} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4">
      <NewRequest onSent={(ref) => { setOpenRef(ref); setView('thread') }} />

      <p className="mt-4 text-2xs font-semibold uppercase tracking-wide text-muted">Your requests</p>
      {threads === null ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
      ) : threads.length === 0 ? (
        <p className="mt-2 text-meta text-muted">Nothing yet. Send us a message above and we&rsquo;ll reply here.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {threads.map((t) => (
            <li key={t.ref}>
              <button
                type="button"
                onClick={() => { setOpenRef(t.ref); setView('thread') }}
                className="block w-full px-3 py-2 text-left hover:bg-surface-elevated"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-body-sm font-medium text-text">{t.subject}</span>
                  <span className="shrink-0 text-3xs font-semibold uppercase tracking-wide text-muted">{STATUS_COPY[t.status] ?? t.status}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewRequest({ onSent }: { onSent: (ref: string) => void }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = () => {
    const body = message.trim()
    if (!body) return
    setError(null)
    start(async () => {
      const res = await startMySupportRequestAction({ message: body })
      if (isError(res)) { setError(res.error); return }
      setMessage('')
      onSent(res.data.ref)
    })
  }

  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Send us a message</p>
      <p className="mt-1 text-meta text-muted">Tell us what you need. We&rsquo;ll reply right here and by email.</p>
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        aria-label="Send us a message"
        placeholder="How can we help?"
        className="mt-2 resize-none"
      />
      {error && <p className="mt-1 text-meta text-danger">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={pending || !message.trim()}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message
      </button>
    </div>
  )
}

function SupportThread({ refId, onBack }: { refId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<{ subject: string; status: string; messages: Msg[] } | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const { ref: listRef, stickNow } = useStickToBottom<HTMLDivElement>([detail?.messages.length ?? 0])

  useEffect(() => {
    void loadMySupportThreadAction(refId).then((res) => {
      if (!isError(res)) setDetail({ subject: res.data.subject, status: res.data.status, messages: res.data.messages })
    })
  }, [refId])

  const send = () => {
    const body = reply.trim()
    if (!body) return
    setError(null)
    stickNow()
    start(async () => {
      const res = await postMySupportReplyAction({ ref: refId, body })
      // A failed reply used to do NOTHING visible: no error, draft still sitting there, and no
      // way to tell it had not been sent. Say so.
      if (isError(res)) { setError(res.error); return }
      setReply('')
      setDetail((d) => (d ? { ...d, messages: [...d.messages, res.data] } : d))
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-lg p-1.5 text-muted hover:bg-surface-elevated hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-0 truncate text-body-sm font-semibold text-text">{detail?.subject ?? 'Support request'}</span>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3">
        {detail === null ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
        ) : (
          detail.messages.map((m) => (
            <div key={m.id} className={m.author === 'visitor' ? 'flex justify-end' : 'flex justify-start'}>
              <span className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-body-sm ${m.author === 'visitor' ? 'bg-primary text-on-primary' : 'bg-surface-elevated text-text'}`}>
                {m.body}
              </span>
            </div>
          ))
        )}
      </div>
      <ChatComposer
        className="border-t border-border px-3 py-2"
        value={reply}
        onValueChange={setReply}
        onSend={send}
        label="Reply"
        placeholder="Reply…"
        pending={pending}
        error={error}
        showHint={false}
      />
    </div>
  )
}
