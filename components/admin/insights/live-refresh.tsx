'use client'

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FreshnessNote } from '@/components/admin/freshness-note'

const subscribeVisibility = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify)
  return () => document.removeEventListener('visibilitychange', notify)
}
const hiddenSnapshot = () => document.visibilityState !== 'visible'
const serverHiddenSnapshot = () => false

/** Only mounted on the active Growth tab. Hidden tabs stop polling; pending reads never overlap. */
export function LiveRefresh({ at }: { at: string | null }) {
  const router = useRouter()
  const [paused, setPaused] = useState(false)
  const [pending, startTransition] = useTransition()
  const hidden = useSyncExternalStore(subscribeVisibility, hiddenSnapshot, serverHiddenSnapshot)
  useEffect(() => {
    if (paused || hidden || pending) return
    const id = setInterval(() => {
      if (!document.hidden) startTransition(() => router.refresh())
    }, 60_000)
    return () => clearInterval(id)
  }, [paused, hidden, pending, router])
  return (
    <div className="flex flex-wrap items-center gap-3">
      {at ? <FreshnessNote at={at} sla={2} label="Reading computed" /> : <span className="text-meta text-muted">No successful growth reading yet.</span>}
      <span role="status" className="text-meta text-muted">{paused ? 'Automatic refresh paused' : hidden ? 'Automatic refresh paused while this tab is hidden' : pending ? 'Refreshing the reading' : 'Refreshes every minute while visible'}</span>
      <Button size="sm" variant="secondary" onClick={() => startTransition(() => router.refresh())} loading={pending}>Refresh now</Button>
      <Button size="sm" variant="ghost" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>{paused ? 'Resume' : 'Pause'}</Button>
    </div>
  )
}
