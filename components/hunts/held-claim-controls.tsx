'use client'

// Approve or turn down one held claim (FH-020T). One idempotency key per claim, kept across retries, so a
// dropped connection can be tapped again without deciding twice.
import { useState, useTransition } from 'react'
import { reviewHeldClaimAction } from '@/app/(main)/hunts/staff/actions'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/field'

export function HeldClaimControls({ claimId }: { claimId: string }) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  const [key] = useState(() => crypto.randomUUID())

  function decide(decision: 'approve' | 'reject') {
    start(async () => {
      const out = await reviewHeldClaimAction({ claimId, decision, reason, idempotencyKey: `${key}-${decision}` })
      if ('error' in out) {
        setMessage(out.error)
      } else {
        setMessage(out.data.message)
        setDone(true)
      }
    })
  }

  return (
    <div className="space-y-3">
      {!done && (
        <>
          <Field label="Reason (needed to turn it down)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={280} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => decide('approve')}>Approve</Button>
            <Button type="button" variant="secondary" disabled={pending || reason.trim().length < 3} onClick={() => decide('reject')}>Turn it down</Button>
          </div>
        </>
      )}
      {message && <p role="status" className="text-body-sm">{message}</p>}
    </div>
  )
}
