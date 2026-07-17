'use client'

// The Resonance CRM 2-way Inbox workspace (ADR-629): a two-pane conversation view. Left, the list of
// contact threads (newest first, an "awaiting reply" dot on inbound-latest ones). Right, the selected
// conversation and a reply composer that enqueues an outbound email through the gated send path
// (sendInboxReplyAction → resolveSendGate → enqueueEmail). Types are imported TYPE-ONLY from
// lib/crm/inbox (the module also holds the service-role IO, which must never reach the client bundle).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import type { InboxThread } from '@/lib/crm/inbox'
import { sendInboxReplyAction } from '@/app/(main)/admin/crm/inbox/actions'
import { FollowUpButton } from './follow-up-button'

function when(at: string): string {
  const t = Date.parse(at)
  if (Number.isNaN(t)) return ''
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function InboxWorkspace({ threads }: { threads: InboxThread[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(threads[0]?.contactId ?? null)
  const selected = useMemo(
    () => threads.find((t) => t.contactId === selectedId) ?? threads[0] ?? null,
    [threads, selectedId],
  )

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No conversations yet"
        description="When you email a contact or a reply comes in, the conversation shows up here."
      />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1">
        {threads.map((t) => {
          const active = t.contactId === selected?.contactId
          return (
            <li key={t.contactId}>
              <button
                type="button"
                onClick={() => setSelectedId(t.contactId)}
                className={`w-full rounded-md px-3 py-2 text-left ${
                  active ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text">
                    {t.contactName || t.contactEmail || 'Unknown contact'}
                  </span>
                  <span className="shrink-0 text-2xs text-muted">{when(t.lastAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {t.awaitingReply && (
                    <span className="inline-block size-1.5 shrink-0 rounded-full bg-primary" aria-label="Awaiting reply" />
                  )}
                  <span className="truncate text-xs text-muted">{t.messages[0]?.title}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && <Conversation key={selected.contactId} thread={selected} />}
    </div>
  )
}

function Conversation({ thread }: { thread: InboxThread }) {
  const router = useRouter()
  const lastSubject = thread.messages[0]?.title ?? ''
  const [subject, setSubject] = useState(lastSubject.startsWith('Re:') ? lastSubject : `Re: ${lastSubject}`)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function send() {
    const trimmed = body.trim()
    if (!trimmed) {
      setError('Write a reply first.')
      return
    }
    setError(null)
    setOkMsg(null)
    start(async () => {
      const res = await sendInboxReplyAction({ contactId: thread.contactId, subject: subject.trim(), body: trimmed })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setBody('')
      setOkMsg('Reply queued.')
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{thread.contactName || 'Unknown contact'}</p>
          {thread.contactEmail && <p className="truncate text-xs text-muted">{thread.contactEmail}</p>}
        </div>
        <FollowUpButton contactId={thread.contactId} contactName={thread.contactName} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {[...thread.messages].reverse().map((m) => {
          const outbound = m.direction === 'outbound'
          return (
            <div key={m.id} className={outbound ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  outbound ? 'bg-primary/10 text-text' : 'bg-surface-elevated text-text'
                }`}
              >
                <p className="text-2xs uppercase tracking-wide text-muted">
                  {outbound ? 'You' : 'Them'} · {m.channel} · {when(m.at)}
                </p>
                <p className="mt-0.5 text-sm font-medium">{m.title}</p>
                {m.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{m.detail}</p>}
              </div>
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending) send()
        }}
        className="space-y-2 border-t border-border p-3"
      >
        {error && (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {okMsg && <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">{okMsg}</p>}
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          aria-label="Subject"
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Reply to ${thread.contactName || 'this contact'}...`}
          rows={4}
          aria-label="Reply"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-muted">Sends through the consent gate. Members who opted out won&apos;t receive it.</p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}
            Send reply
          </Button>
        </div>
      </form>
    </div>
  )
}
