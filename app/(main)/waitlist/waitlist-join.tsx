'use client'

// The waitlist join form (Growth OS Engine 3, GE3-1, ADR-456). A signed-in member
// joins with one tap; an anonymous joiner leaves an email + city. On success it shows
// their position in line. Strings are CONTENT-VOICE (plain, no em dashes); semantic
// tokens only.

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { joinWaitlist } from './actions'

export function WaitlistJoin({ signedIn }: { signedIn: boolean }) {
  const [email, setEmail] = useState('')
  const [locality, setLocality] = useState('')
  const [position, setPosition] = useState<number | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setErr(null)
    start(async () => {
      const res = await joinWaitlist({ track: 'seeker', email: signedIn ? undefined : email, locality })
      if (isError(res)) {
        setErr(res.error)
        return
      }
      setPosition(res.data.position)
    })
  }

  if (position !== undefined) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-text">You are on the list.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {position ? `You are number ${position} in line. ` : ''}We will reach out the moment your area opens.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      {!signedIn && (
        <div>
          <Label htmlFor="wl-email">Email</Label>
          <Input
            id="wl-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={200}
          />
        </div>
      )}
      <div>
        <Label htmlFor="wl-city">Your city</Label>
        <p className="mb-1.5 text-xs text-subtle">So we know where to open next.</p>
        <Input
          id="wl-city"
          value={locality}
          onChange={(e) => setLocality(e.target.value)}
          placeholder="Encinitas, CA"
          maxLength={120}
        />
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}

      <Button onClick={submit} disabled={pending || (!signedIn && !email.trim())}>
        {pending ? 'Saving your spot…' : 'Save my spot'}
      </Button>
    </div>
  )
}
