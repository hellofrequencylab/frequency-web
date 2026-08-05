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
// The prerequisite this copy used to carry — that the dock could not rename a group conversation,
// leave one, or show its roster — is DONE, and the flag is on. What the copy carries now is the
// other direction: what turning it back OFF costs, since that is the flip an operator would reach
// for in a hurry. components/messages/dock-parity.test.ts is what keeps the three capabilities
// from silently regressing out of the dock.
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
        <span className="text-body-sm font-medium text-text">
          {retired
            ? 'Dock only: opening a message hands it to the chat dock'
            : 'Both: the full message page still opens'}
        </span>
      </div>
      <p className="text-meta text-muted">
        On is the intended setting: direct and group messages happen in the chat dock, and the dock
        can rename a group, leave one, and show who is in it. Turning it off brings the full message
        page back, which is the thing to do if the dock ever misbehaves. Rooms are separate and this
        switch never touches them, so Space and Channel conversations keep their own page either way.
      </p>
    </div>
  )
}
