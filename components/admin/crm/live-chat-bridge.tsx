'use client'

// Operator-side live panel for an in-app chat conversation (ADR-816). Replaces the email composer in the
// Conversations reader when the thread's channel is `in_app`: it joins the same token-named Broadcast
// channel as the visitor's widget, so messages and the typing indicator are live both ways. Message history
// is the durable server truth (loaded via the admin action); the operator's reply persists then broadcasts.

import { useState } from 'react'
import { useSupportChat } from '@/components/chat/use-support-chat'
import { sendOperatorChatReplyAction, loadOperatorChatHistoryAction } from '@/app/support-chat/operator-actions'
import { ChatComposer } from '@/components/ui/chat-composer'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'

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
  const { ref: listRef, stickNow } = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])

  function onSend() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    stickNow()
    // Put the words back if the send failed. Clearing the box and showing an error banner
    // while the reply itself evaporates is the worst of both.
    void send(body).then((sent) => { if (!sent) setDraft((cur) => (cur ? cur : body)) })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
          <span className="size-1.5 animate-pulse rounded-pill bg-primary" /> Live chat
        </span>
        {typingNames.length > 0 && <span className="text-2xs text-muted">visitor is typing…</span>}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {loading && <p className="text-center text-2xs text-muted">Loading…</p>}
        {messages.map((m) => (
          <div key={m.id} className={m.author === 'staff' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-body-sm ${
                m.author === 'staff' ? 'bg-primary/10 text-text' : 'bg-surface-elevated text-text'
              }`}
            >
              {m.body}
            </div>
          </div>
        ))}
      </div>
      <ChatComposer
        className="border-t border-border p-2"
        value={draft}
        onValueChange={(next) => { setDraft(next); notifyTyping() }}
        onSend={onSend}
        label="Reply live"
        placeholder="Reply live…"
        error={error}
        showHint={false}
      />
    </div>
  )
}
