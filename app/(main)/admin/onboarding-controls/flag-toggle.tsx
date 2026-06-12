'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Toggle } from '@/components/admin/toggle'

// A Settings toggle (ADR-233 §5: autosave with an inline "Saved") for one platform flag.
// The matching server action is passed in by the view so this stays a thin, reusable
// control — the page wires each switch to its own action.
export function FlagToggle({
  enabled,
  ariaLabel,
  action,
}: {
  enabled: boolean
  ariaLabel: string
  action: (next: boolean) => Promise<void>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function toggle() {
    setSaved(false)
    start(async () => {
      await action(!enabled)
      router.refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <Toggle
      checked={enabled}
      onChange={toggle}
      ariaLabel={ariaLabel}
      disabled={pending}
      saveState={pending ? 'saving' : saved ? 'saved' : 'idle'}
    />
  )
}
