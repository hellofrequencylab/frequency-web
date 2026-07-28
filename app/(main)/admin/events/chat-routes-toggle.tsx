'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Toggle } from '@/components/admin/toggle'
import { setChatDmRoutesRetired } from './series-actions'

// The chat consolidation switch (ADR-896). Models app/(main)/admin/community/feed-reach-toggle.tsx:
// a Settings toggle that autosaves on flip with an inline "Saved", driven by the shared kit Toggle.
//
// WHY THIS EXISTS: the flag shipped with no operator control at all, so the only way to flip it was
// hand-written SQL against platform_flags. A switch nobody can reach is not a kill switch.
//
// The copy carries the prerequisite rather than hiding it in an ADR. An operator flipping this
// blind would retire the only surface that can rename a group conversation, leave one, or show its
// roster, and would find out from members rather than from us.
export function ChatRoutesToggle({ retired }: { retired: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function toggle() {
    setSaved(false)
    start(async () => {
      await setChatDmRoutesRetired(!retired)
      router.refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Toggle
          checked={retired}
          onChange={toggle}
          ariaLabel="Chat in the dock only: retire the full-page direct message view"
          disabled={pending}
          saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
        />
        <span className="text-sm font-medium text-text">
          {retired
            ? 'Dock only: opening a message hands it to the chat dock'
            : 'Both: the full message page still opens'}
        </span>
      </div>
      <p className="text-xs text-muted">
        Turning this on retires the full-page message view. Leave it off until the dock can rename a
        group conversation, leave one, and show who is in it. Those three live only on the page
        today, so members would lose them. Reconnect and Message already open the dock either way.
      </p>
    </div>
  )
}
