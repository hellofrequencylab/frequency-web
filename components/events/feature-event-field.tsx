'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { requestFeatureEventBySlug } from '@/app/(main)/events/share-actions'

// "Feature an event" — the space-side entry into the co-host handshake (Events EC3). A space steward
// pastes a public event's link, which asks that event's host to feature it on this space's calendar.
// The host approves (unless this space already hosts the event or the two spaces collaborate, in which
// case it lands accepted). Mirrors the InviteCollaborator paste-a-link pattern. No em dashes.

export function FeatureEventField({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function submit() {
    if (!value.trim() || pending) return
    start(async () => {
      setError(null)
      setNotice(null)
      const res = await requestFeatureEventBySlug(spaceId, value)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setNotice('Request sent. The event host approves it, then it shows on your calendar.')
      setValue('')
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-subtle" aria-hidden />
        <h2 className="text-sm font-bold text-text">Feature an event</h2>
      </div>
      <p className="mb-3 text-xs text-subtle">
        Paste a public event link to ask its host to feature it on your space calendar. They approve it,
        then it shows up alongside your own events.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="frequencylocal.com/events/sound-bath  or  sound-bath"
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <Button type="button" onClick={submit} disabled={!value.trim() || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
          Send request
        </Button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
      {notice && !error && <p className="mt-2 text-sm font-medium text-success">{notice}</p>}
    </section>
  )
}
