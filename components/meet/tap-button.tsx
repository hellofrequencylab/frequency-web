'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Handshake } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { tapMeet } from '@/lib/meet/actions'
import { MEETUP_TAP_ZAPS, tapLine } from '@/lib/meet/codes'

// THE TAP (LIVE-946): one press records the meet. A typed code works too, for a member whose camera
// would not read the screen. The result line is the pure tapLine. No em dashes.

export function TapMeetButton({ code }: { code: string | null }) {
  const [typed, setTyped] = useState('')
  const [line, setLine] = useState<string | null>(null)
  const [handle, setHandle] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const value = code ?? typed

  function tap() {
    start(async () => {
      const r = await tapMeet(value)
      if ('error' in r) {
        setLine(r.error)
        return
      }
      setLine(tapLine(r.data, r.data.other?.name ?? null, r.data.zapsAwarded || (r.data.ok ? MEETUP_TAP_ZAPS : 0)))
      setHandle(r.data.ok ? (r.data.other?.handle ?? null) : null)
    })
  }

  return (
    <div className="space-y-3">
      {code === null && (
        <label className="block">
          <span className="text-meta font-semibold text-muted">Their code</span>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            inputMode="text"
            autoCapitalize="characters"
            maxLength={9}
            placeholder="K7Q2 MX4P"
            className="mt-1 w-full font-mono tracking-widest"
          />
        </label>
      )}
      <button type="button" onClick={tap} disabled={pending || !value} className="btn primary w-full">
        <Handshake className="h-4 w-4" aria-hidden /> {pending ? 'Recording' : 'We met'}
      </button>
      {line && (
        <p className="text-body-sm text-text" role="status">
          {line}{' '}
          {handle && (
            <Link href={`/people/${handle}`} className="font-semibold underline">
              See their profile
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
