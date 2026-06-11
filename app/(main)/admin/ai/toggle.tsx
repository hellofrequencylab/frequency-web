'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Toggle } from '@/components/admin/toggle'
import { setAiEnabled } from './actions'

// `onToggled` lets an embedded host (e.g. the in-place AI module in the console)
// re-fetch its own state after a change; the standalone page omits it and falls
// back to a router refresh. A Settings toggle: autosaves with an inline "Saved"
// (ADR-233 §5), driven by the shared kit `Toggle`.
export function AiToggle({ enabled, onToggled }: { enabled: boolean; onToggled?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function toggle() {
    setSaved(false)
    start(async () => {
      await setAiEnabled(!enabled)
      if (onToggled) onToggled()
      else router.refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <Toggle
      checked={enabled}
      onChange={toggle}
      ariaLabel="AI enabled"
      disabled={pending}
      saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
    />
  )
}
