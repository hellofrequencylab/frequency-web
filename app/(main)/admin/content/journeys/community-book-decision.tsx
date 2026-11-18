'use client'

// Certify or return one Community Book. Returning needs a note; certifying can carry one.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { decideCommunityBookAction } from './credential-actions'

export function CommunityBookDecision({ id }: { id: string }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const decide = (decision: 'certified' | 'returned') =>
    start(async () => {
      setError(null)
      const r = await decideCommunityBookAction({ id, decision, note })
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Note to the member"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A note to them (needed to send it back)"
        disabled={pending}
      />
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide('certified')} disabled={pending}>
          Certify
        </Button>
        <Button size="sm" variant="secondary" onClick={() => decide('returned')} disabled={pending}>
          Send back
        </Button>
      </div>
    </div>
  )
}
