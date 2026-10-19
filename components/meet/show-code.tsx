'use client'

import { useEffect, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { refreshMeetCode, type ShownMeetCode } from '@/lib/meet/actions'
import { MEET_CODE_TTL_SECONDS, formatMeetCode } from '@/lib/meet/codes'

// THE CODE ON YOUR SCREEN (LIVE-946): the QR and the eight letters, a seconds counter, and a fresh code
// before the old one lapses. The first code arrives from the server; every later one comes from the
// action, so the page never holds a code older than a minute. Tokens only, no hardcoded hex. No em dashes.

export function ShowMeetCode({ initial }: { initial: ShownMeetCode }) {
  const [shown, setShown] = useState(initial)
  const [left, setLeft] = useState(MEET_CODE_TTL_SECONDS)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function refresh() {
    start(async () => {
      const r = await refreshMeetCode()
      if ('error' in r) setError(r.error)
      else {
        setError(null)
        setShown(r.data)
      }
    })
  }

  useEffect(() => {
    const expires = Date.parse(shown.expiresAt)
    const tick = () => {
      const s = Math.max(0, Math.ceil((expires - Date.now()) / 1000))
      setLeft(s)
      if (s <= 5) refresh()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [shown.expiresAt])

  return (
    <div className="rounded-card border border-border bg-surface p-5 text-center lift-1">
      <div className="mx-auto w-56 max-w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: shown.svg }} />
      <p className="mt-4 font-mono text-lead font-bold tracking-widest text-text">{formatMeetCode(shown.code)}</p>
      <p className="mt-1 text-meta text-muted" aria-live="polite">
        {pending ? 'New code on its way.' : `Fresh for ${left}s.`}
      </p>
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
      <button type="button" onClick={refresh} disabled={pending} className="btn sm mt-3">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> New code
      </button>
    </div>
  )
}
