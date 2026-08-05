'use client'

// Operator-side live panel for an in-app chat conversation (ADR-816). Replaces the email composer in the
// Conversations reader when the thread's channel is `in_app`: it joins the same token-named Broadcast
// channel as the visitor's widget, so messages and the typing indicator are live both ways. Message history
// is the durable server truth (loaded via the admin action); the operator's reply persists then broadcasts.

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useSupportChat } from '@/components/chat/use-support-chat'
import { sendOperatorChatReplyAction, loadOperatorChatHistoryAction } from '@/app/support-chat/operator-actions'

export function LiveChatBridge({ chatRef, token }: { chatRef: string; token: string }) {
  const [viewerId] = useState(() => `op-${crypto.randomUUID()}`)
  const { messages, loading, error, send, typingNames, notifyTyping } = useSupportChat({
    token,
    viewerId,
    viewerName: 'Frequency',
    role: 'staff',
    persist: (body) => sendOperatorChatReplyAction({ ref: chatRef, body }),
    loadHistory: () => loadOperatorChatHistoryAction({ ref: chatRef }),
  })
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, typingNames.length])

  function onSend() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    void send(body)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
          <span className="size-1.5 animate-pulse rounded-pill bg-primary" /> Live chat
        </span>
        {typingNames.length > 0 && <span className="text-2xs text-muted">visitor is typing…</span>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading && <p className="text-center text-2xs text-muted">Loading…</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.author === 'staff' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.author === 'staff' ? 'bg-primary/10 text-text' : 'bg-surface-elevated text-text'
              }`}
            >
              {m.body}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && (
        <p role="alert" className="px-3 pb-1 text-2xs text-danger">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2 border-t border-border p-2">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            notifyTyping()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          rows={1}
          placeholder="Reply live…"
          className="max-h-24 flex-1 resize-none rounded-lg border border-border bg-canvas px-3 py-2 text-body-sm text-text focus:border-border-strong focus:outline-none"
        />
        <button
          type="button"
          onClick={onSend}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
