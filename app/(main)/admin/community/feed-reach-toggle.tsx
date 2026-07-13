'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Toggle } from '@/components/admin/toggle'
import { setFeedOpen } from './actions'

// The open-feed switch. A Settings toggle (ADR-233 §5): autosaves on flip with an inline
// "Saved", driven by the shared kit Toggle. `open` = the feed is OPEN (everyone sees
// everyone's posts); off = the reach gate ("your circles + nearby") is in force.
export function FeedReachToggle({ open }: { open: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function toggle() {
    setSaved(false)
    start(async () => {
      await setFeedOpen(!open)
      router.refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <Toggle
        checked={open}
        onChange={toggle}
        ariaLabel="Open feed: everyone sees everyone's posts"
        disabled={pending}
        saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
      />
      <span className="text-sm font-medium text-text">
        {open ? 'Open: everyone sees everyone’s posts' : 'Reach gate on: your circles & nearby only'}
      </span>
    </div>
  )
}
