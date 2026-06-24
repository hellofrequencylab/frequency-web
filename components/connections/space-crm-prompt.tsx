'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, X } from 'lucide-react'

// CONTEXTUAL UPGRADE PROMPT (CRM-STRATEGY §6, P3). A light, dismissible nudge atop My Contacts for a
// member who has built up some contacts: if they are running this as a business, their contacts can
// graduate into a Space CRM. It links to the spaces directory (where they can open or stand up a
// space). The parent only renders it when the member has contacts, so it never greets an empty list.
//
// Dismissal persists in localStorage so it stays gone once waved off (no server round-trip for a
// cosmetic nudge). Voice (CONTENT-VOICE §10): plain, an honest "if this is a business" frame, no
// narrated feelings, no em or en dashes. "Space CRM" matches the naming used across the P3 surfaces.

const DISMISS_KEY = 'fq_my_contacts_space_crm_dismissed'

export function SpaceCrmPrompt() {
  // Mirrors the accepted UpgradeCrew pattern: render shown, then hide once we read a prior dismissal
  // from localStorage (the one-frame settle is the same trade the codebase already makes for nudges).
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* a private-mode write failure just means it re-shows next visit; harmless */
    }
  }

  if (dismissed) return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Briefcase className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-text">Running this as a business?</h2>
        <p className="mt-0.5 text-sm text-muted">
          Your contacts can graduate into a Space CRM: a pipeline with stages and deals for the people
          you work with. Bring them over in one step and keep your private list as it is.
        </p>
        <Link
          href="/spaces/directory"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"
        >
          See spaces
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
