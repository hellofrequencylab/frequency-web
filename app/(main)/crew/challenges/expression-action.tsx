'use client'

import { useState, useTransition } from 'react'
import { Users, Globe, Loader2 } from 'lucide-react'
import { completeExpression } from '../gamification-actions'

// The Expression Challenge capstone control. A Journey's Expression Challenge is a
// single deliberate act (share what you practiced), not a counter, so it gets a
// "where did you do it" choice instead of a progress bar: in person at a Circle
// (+50 Zaps) or solo online (+30 Gems). Completing it can finish the Journey.
export function ExpressionAction({ journeyId }: { journeyId: string }) {
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'circle' | 'online' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(next: 'circle' | 'online') {
    setError(null)
    setMode(next)
    startTransition(async () => {
      const res = await completeExpression(journeyId, next)
      if (!res.ok || !res.found) {
        setError('That did not go through. Give it another try in a moment.')
        setMode(null)
      }
      // On success the server action revalidates the page, so the card flips to
      // complete on its own.
    })
  }

  return (
    <div className="mt-2.5">
      <p className="mb-1.5 text-xs text-subtle">Share what you practiced to finish this Journey:</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run('circle')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-60"
        >
          {pending && mode === 'circle' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
          Shared at a Circle
          <span className="text-primary-strong">+50 Zaps</span>
        </button>
        <button
          type="button"
          onClick={() => run('online')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-60"
        >
          {pending && mode === 'online' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          Posted it online
          <span className="text-primary-strong">+30 Gems</span>
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
