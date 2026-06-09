'use client'

import { useState, useTransition } from 'react'
import { toggleJourneyOfficial } from './actions'

// Journey-library controls. The quest-chain create/edit/delete dialogs that used
// to live here are gone with the retired engine (ADR-152 Phase B3).

// ── Official toggle for journey plans ─────────────────────────────────────────

export function OfficialToggle({ id, isOfficial }: { id: string; isOfficial: boolean }) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isOfficial)

  function handleToggle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      try {
        await toggleJourneyOfficial(id, next)
      } catch {
        setOptimistic(!next) // revert on error
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      title={optimistic ? 'Official — click to remove' : 'Not official — click to mark official'}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${
        optimistic ? 'bg-success' : 'bg-border-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          optimistic ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
