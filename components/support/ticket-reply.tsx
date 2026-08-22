'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replyToTicket } from '@/app/(main)/support/actions'
import { ChatComposer } from '@/components/ui/chat-composer'

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
    // ⌘/Ctrl+Enter, not bare Enter: a ticket reply is long-form (paragraphs are normal here),
    // where Enter-to-send sends half a thought. The hint says which, because an unlabelled
    // send key is a guess.
    <ChatComposer
      value={body}
      onValueChange={setBody}
      onSend={send}
      label="Add a reply"
      placeholder={disabled ? 'This ticket is closed. Reopen it by replying.' : 'Add a reply…'}
      pending={pending}
      error={error}
      submitKey="mod-enter"
      minRows={2}
    />
  )
}
