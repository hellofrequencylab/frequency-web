'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { invitePartnerSpace, respondPartnerInvite } from '@/lib/collective/partners-actions'
import { COLLECTIVE_PARTNER_CAP } from '@/lib/collective/partners'
import { isError, type ActionResult } from '@/lib/action-result'

interface Row { id: string; name: string; slug: string }

/** Hub owner controls: invite a Space run by someone else, withdraw a pending invite, or end a
 *  partnership. Nothing here reaches into a partner's own Space. */
export function PartnersManager({ hubId, slotsLeft, pending, partners }: { hubId: string; slotsLeft: number; pending: Row[]; partners: Row[] }) {
  const [handle, setHandle] = useState(''), [message, setMessage] = useState('')
  const [busy, startTransition] = useTransition()
  const router = useRouter()
  const run = (action: () => Promise<ActionResult>, done: string) => startTransition(async () => {
    try {
      const result = await action()
      setMessage(isError(result) ? result.error : done)
      if (!isError(result)) { setHandle(''); router.refresh() }
    } catch { setMessage('That did not save. Try again.') }
  })
  return <div className="space-y-6">
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (handle.trim()) run(() => invitePartnerSpace(hubId, handle), 'Invite sent.') }}>
      <Field label="Invite a Space" hint={`Paste its link or handle. Its owner accepts before it joins. ${slotsLeft} of ${COLLECTIVE_PARTNER_CAP} spots open.`}>
        <Input type="text" value={handle} onChange={e => setHandle(e.target.value)} placeholder="their-space" disabled={busy || slotsLeft === 0} />
      </Field>
      <Button type="submit" disabled={busy || slotsLeft === 0 || !handle.trim()}>Send invite</Button>
      {slotsLeft === 0 ? <p className="text-body-sm text-muted">All {COLLECTIVE_PARTNER_CAP} spots are taken. Withdraw an invite or end a partnership to open one.</p> : null}
    </form>
    {pending.length ? <ul className="space-y-3">{pending.map(row => <li key={row.id} className="flex flex-wrap items-center gap-3">
      <span><Link href={`/spaces/${row.slug}`} className="text-primary hover:underline">{row.name}</Link> · waiting for their owner</span>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => respondPartnerInvite(row.id, 'revoked'), 'Invite withdrawn.')}>Withdraw invite</Button>
    </li>)}</ul> : <p className="text-body-sm text-muted">No invites waiting.</p>}
    {partners.length ? <ul className="space-y-3">{partners.map(row => <li key={row.id} className="flex flex-wrap items-center gap-3">
      <span>{row.name}</span>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => respondPartnerInvite(row.id, 'revoked'), 'Partnership ended.')}>End partnership</Button>
    </li>)}</ul> : null}
    {message ? <p role="status" className="text-body-sm">{message}</p> : null}
  </div>
}
