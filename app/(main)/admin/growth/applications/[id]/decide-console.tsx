'use client'

// The accept / decline console for one application (Growth OS Engine 3, GE3-4,
// ADR-456). Claims into review, then accepts (host accept picks a Starter Circle to
// hand off) or declines with a note. The page passes the active Starter Circles; this
// client dispatches the gated actions and refreshes. Strings are CONTENT-VOICE (plain,
// no em dashes); semantic tokens only.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea, Label, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { claimApplication, acceptApplication, declineApplication } from '../actions'

export interface StarterTemplateOption {
  id: string
  name: string
  pillar: string
}

export function DecideConsole({
  applicationId,
  status,
  grantsHost,
  starterTemplates,
}: {
  applicationId: string
  status: string
  grantsHost: boolean
  starterTemplates: StarterTemplateOption[]
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [starter, setStarter] = useState(starterTemplates[0]?.id ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<void>) {
    setErr(null)
    start(async () => {
      await fn()
    })
  }

  function claim() {
    run(async () => {
      const res = await claimApplication(applicationId)
      if (isError(res)) setErr(res.error)
      else router.refresh()
    })
  }

  function accept() {
    run(async () => {
      const res = await acceptApplication({
        id: applicationId,
        starterTemplateId: grantsHost ? starter || null : null,
        reason: reason || null,
      })
      if (isError(res)) setErr(res.error)
      else router.refresh()
    })
  }

  function decline() {
    run(async () => {
      const res = await declineApplication({ id: applicationId, reason: reason || null })
      if (isError(res)) setErr(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      {status === 'pending' && (
        <Button size="sm" variant="secondary" onClick={claim} disabled={pending}>
          {pending ? 'Working…' : 'Claim for review'}
        </Button>
      )}

      {grantsHost && starterTemplates.length > 0 && (
        <div>
          <Label htmlFor="starter">Starter Circle to hand off</Label>
          <select
            id="starter"
            value={starter}
            onChange={(e) => setStarter(e.target.value)}
            className={fieldClasses}
          >
            {starterTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.pillar})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-subtle">
            We create this as a private draft the new host owns and finishes.
          </p>
        </div>
      )}

      {grantsHost && starterTemplates.length === 0 && (
        <p className="text-xs text-muted">
          No Starter Circles are active. Accepting still grants the host role so the Leadership tab opens.
        </p>
      )}

      <div>
        <Label htmlFor="reason">Note (optional)</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="A line for the decision trail."
        />
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={accept} disabled={pending}>
          {pending ? 'Working…' : grantsHost ? 'Accept and grant host' : 'Accept'}
        </Button>
        <Button variant="ghost" onClick={decline} disabled={pending}>
          Decline
        </Button>
      </div>
    </div>
  )
}
