'use client'

import { useTransition } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { openFollowUpDm } from './actions'

// Opens (or starts) a direct thread from the host to a follow-up member. The
// server action finds-or-creates the 1:1 conversation and redirects into it, so
// no conversation is ever created just by loading the Manage page.
export function FollowUpButton({
  eventId,
  memberProfileId,
}: {
  eventId: string
  memberProfileId: string
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => start(() => openFollowUpDm(eventId, memberProfileId))}
      disabled={pending}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {pending ? 'Opening…' : 'Message'}
    </Button>
  )
}
