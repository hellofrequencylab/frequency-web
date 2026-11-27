'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resendTicketFromManage } from './attendance-actions'

// Send the ticket again (LIVE-2548), to the address it went to the first time.
export function ResendTicketButton({ eventId, ticketId }: { eventId: string; ticketId: string }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const run = () =>
    start(async () => {
      setNote(null)
      const result = await resendTicketFromManage(eventId, ticketId)
      setNote(result.ok ? 'Sent' : 'That did not send. Try again.')
    })
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <Button size="sm" variant="ghost" onClick={run} disabled={pending} aria-label="Resend ticket">
        <Send className="h-3.5 w-3.5" />
        {pending ? 'Sending…' : 'Resend'}
      </Button>
      {note && (
        <span role="status" className="text-meta text-muted">
          {note}
        </span>
      )}
    </span>
  )
}
