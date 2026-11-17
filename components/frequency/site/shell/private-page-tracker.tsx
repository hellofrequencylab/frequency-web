'use client'

// Reader tracking for the link-only partner pages that render inside the marketing shell (/facilities,
// /lab). The same tracker /how runs (lib/how/brief-tracker.ts): a ?r= reader code, sections, scroll,
// engaged time, and every click, posted first-party to /api/how/beacon. Renders nothing.
import { useEffect } from 'react'
import { startBriefTracker } from '@/lib/how/brief-tracker'
import type { PrivatePage } from '@/lib/how/brief-events'

export function PrivatePageTracker({ page }: { page: PrivatePage }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('main') ?? document.body
    const tracker = startBriefTracker(root, page)
    return () => tracker.stop()
  }, [page])
  return null
}
