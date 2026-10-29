'use client'

// The handle check, in the name card: asks /api/check-space-handle about the handle on screen, a beat after the
// visitor stops typing, and keeps the answers it has had so a handle seen once is never asked about twice. The
// check is advice. Offline, throttled or failing, it says `unknown` and the visitor carries on; the launch checks
// the handle again when the Space is made.
import { useEffect, useState } from 'react'
import { isHandleShape, parseVerdict } from '@/lib/create-space/handle'
import type { HandleStatus } from '@/lib/create-space/handle'

const WAIT_MS = 350

export function useHandleStatus(handle: string, active: boolean): HandleStatus {
  const [answers, setAnswers] = useState<Record<string, HandleStatus>>({})
  const known = answers[handle]

  useEffect(() => {
    if (!active || !isHandleShape(handle) || known) return
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-space-handle?handle=${encodeURIComponent(handle)}`, { signal: ctl.signal, cache: 'no-store' })
        const verdict = res.ok ? parseVerdict(await res.json()) : null
        setAnswers((a) => ({ ...a, [handle]: verdict ?? 'unknown' }))
      } catch {
        if (!ctl.signal.aborted) setAnswers((a) => ({ ...a, [handle]: 'unknown' }))
      }
    }, WAIT_MS)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [handle, active, known])

  if (!active) return 'idle'
  if (!isHandleShape(handle)) return 'invalid'
  return known ?? 'checking'
}
