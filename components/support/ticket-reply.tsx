'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { replyToTicket } from '@/app/(main)/support/actions'

// Member reply box on their own ticket. ⌘/Ctrl+Enter or the button sends.
export function TicketReply({ ticketId, disabled = false }: { ticketId: string; disabled?: boolean }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function send() {
    const text = body.trim()
    if (!text || pending) return
    setError(null)
    start(async () => {
      const r = await replyToTicket(ticketId, text)
      if ('error' in r) { setError(r.error); return }
      setBody('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
          rows={2}
          placeholder={disabled ? 'This ticket is closed. Reopen it by replying.' : 'Add a reply…'}
          className="flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !body.trim()}
          aria-label="Send reply"
          className="shrink-0 rounded-xl bg-primary p-2.5 text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
