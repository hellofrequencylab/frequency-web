'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Zap, X } from 'lucide-react'

// The "Upgrade to Crew" pitch for non-paying members. Shown in full once; the
// sell is unlocking the full game (ranks, seasons, rewards, the Quest). After the
// member views/closes it, it tucks under the profile card as a slim "Upgrade" tab
// that re-opens the pitch on click. Dismissal persists (one-time by default).
const KEY = 'fq_upgrade_crew_dismissed'

export function UpgradeCrew() {
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(localStorage.getItem(KEY) === '1')
  }, [])

  function dismiss() {
    setDismissed(true)
    setExpanded(false)
    try { localStorage.setItem(KEY, '1') } catch {}
  }

  // Collapsed → a slim tab sitting flush on top of the profile card.
  if (dismissed && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Upgrade to Crew"
        className="mx-3 -mb-px flex items-center justify-center gap-1.5 rounded-t-lg border border-b-0 border-primary-bg bg-primary-bg/60 px-3 py-1.5 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary-bg"
      >
        <Zap className="h-3.5 w-3.5" />
        Upgrade
      </button>
    )
  }

  return (
    <div className="relative mx-3 mb-3 rounded-xl border border-primary-bg bg-primary-bg p-3.5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-primary-strong/60 transition-colors hover:bg-surface/50 hover:text-primary-strong"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="mb-1 flex items-center gap-1.5 pr-5 text-xs font-semibold text-primary-strong">
        <Zap className="h-3.5 w-3.5 shrink-0" />
        Upgrade to Crew
      </p>
      <p className="mb-3 text-xs leading-snug text-muted">
        Unlock the full game: ranks, seasons, rewards, and the Quest.
      </p>
      <Link
        href="/upgrade"
        className="block rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Upgrade →
      </Link>
    </div>
  )
}
