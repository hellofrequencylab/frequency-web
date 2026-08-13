'use client'

import { useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { approveEventRsvpFromManage } from './actions'

// One-tap approve for a pending RSVP. Calm framing: approving lets the guest in,
// it never forces them 'going' (the capacity trigger still has the final say).
export function ApproveButton({
  eventId,
  slug,
  rsvpId,
}: {
  eventId: string
  slug: string
  rsvpId: string
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      onClick={() => start(() => approveEventRsvpFromManage(eventId, slug, rsvpId))}
      disabled={pending}
    >
      <Check className="h-3.5 w-3.5" />
      {pending ? 'Approving…' : 'Approve'}
    </Button>
  )
}
