'use client'

import { useState, useTransition } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inviteContactToJoin, type InviteToJoinResult } from './actions'

const REASON_MSG: Record<string, string> = {
  disabled: 'Scan-intro emails are off. Turn the switch on (top of Contacts) to send.',
  no_email: 'No email on file for this person.',
  no_invite_path: 'No invite path. This contact wasn’t captured by a steward, so there’s no personal intro to send.',
  already_invited: 'Already invited. We only send the intro once.',
  unsubscribed: 'This person unsubscribed, so we won’t email them.',
  no_referral: 'The capturing steward has no referral link yet.',
  error: 'Something went wrong sending the invite.',
}

export function InviteButton({ contactId, disabled }: { contactId: string; disabled?: boolean }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function onClick() {
    setMsg(null)
    start(async () => {
      const res: InviteToJoinResult = await inviteContactToJoin(contactId)
      if (res.sent) setMsg({ ok: true, text: 'Invite sent.' })
      else setMsg({ ok: false, text: REASON_MSG[res.reason] ?? 'Could not send the invite.' })
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" onClick={onClick} disabled={pending || disabled}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Invite to join
      </Button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-success' : 'text-muted'}`}>{msg.text}</span>}
    </div>
  )
}
