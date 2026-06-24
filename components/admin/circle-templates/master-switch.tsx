'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Power } from 'lucide-react'
import { Toggle } from '@/components/admin/toggle'
import { Banner } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import { setTemplatesEnabled } from '@/app/(main)/admin/circle-templates/actions'

// The global master switch for the member-facing Starter Circles surface
// (platform_flags 'circle_templates_enabled'). Off by default. Optimistic flip with a
// rollback on failure; the server re-checks operator access and is authoritative. This
// is the ONE place the whole gallery turns on for members.

export function MasterSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  function flip(next: boolean) {
    setError(null)
    setOn(next) // optimistic
    setSaveState('saving')
    start(async () => {
      const res = await setTemplatesEnabled(next)
      if (isError(res)) {
        setOn(!next) // roll back
        setSaveState('idle')
        setError(res.error)
        return
      }
      setSaveState('saved')
      router.refresh()
      setTimeout(() => setSaveState('idle'), 1500)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              on ? 'bg-success-bg text-success' : 'bg-surface-elevated text-subtle'
            }`}
          >
            <Power className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">Starter Circles, member-facing</h2>
            <p className="mt-0.5 text-sm text-muted">
              {on
                ? 'On. Members can browse the gallery and make a template their own.'
                : 'Off. The gallery is hidden from members no matter which templates are active.'}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <Toggle
            checked={on}
            onChange={flip}
            ariaLabel="Starter Circles member-facing surface"
            saveState={saveState}
          />
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Banner tone="critical" title="That didn’t go through">
            {error}
          </Banner>
        </div>
      )}
    </div>
  )
}
