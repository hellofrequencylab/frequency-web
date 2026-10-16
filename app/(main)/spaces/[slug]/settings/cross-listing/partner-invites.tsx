'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { respondPartnerInvite } from '@/lib/collective/partners-actions'
import type { IncomingPartnerInvite } from '@/lib/collective/partners-store'
import { isError, type ActionResult } from '@/lib/action-result'

/** The partner side of a Collective invite (SCAN-982): accept, decline, or leave. Joining shares no
 *  members, payouts or settings; it lets this Space list Circles and Journeys with the Collective. */
export function PartnerInvites({ invites }: { invites: IncomingPartnerInvite[] }) {
  const [message, setMessage] = useState('')
  const [busy, startTransition] = useTransition()
  const router = useRouter()
  const run = (action: () => Promise<ActionResult>, done: string) => startTransition(async () => {
    try { const result = await action(); setMessage(isError(result) ? result.error : done); if (!isError(result)) router.refresh() }
    catch { setMessage('That did not save. Try again.') }
  })
  if (!invites.length) return null
  return <section aria-labelledby="partner-invites" className="space-y-3">
    <SectionHeader id="partner-invites" title="Collective partners" count={invites.length} />
    <p className="text-body-sm text-muted">A partner keeps its own members, payouts and settings. You can list Circles and Journeys with the Collective and leave at any time.</p>
    <ul className="space-y-3">{invites.map(invite => <li key={invite.id} className="flex flex-wrap items-center gap-3">
      <span><Link href={`/spaces/${invite.hubSlug}/partners`} className="text-primary hover:underline">{invite.hubName}</Link> · {invite.status === 'pending' ? 'invited you' : 'partner'}</span>
      {invite.status === 'pending' ? <>
        <Button size="sm" disabled={busy} onClick={() => run(() => respondPartnerInvite(invite.id, 'accepted'), 'You joined as a partner.')}>Accept</Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => respondPartnerInvite(invite.id, 'declined'), 'Invite declined.')}>Decline</Button>
      </> : <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => respondPartnerInvite(invite.id, 'revoked'), 'You left the Collective.')}>Leave</Button>}
    </li>)}</ul>
    {message ? <p role="status" className="text-body-sm">{message}</p> : null}
  </section>
}
