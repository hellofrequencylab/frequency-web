'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { ReportButton } from '@/components/support/report-button'

// The site-wide announcement strip that sits directly below the header. A friendly beta notice with a
// "Submit a bug" button (opens the global report dialog via the shared ReportButton). Dismissible per
// browser: the choice is remembered under a VERSIONED key, so editing the message (bump ALERT_KEY)
// re-shows it to everyone who had dismissed the old one.
//
// The dismissal lives in localStorage and is read through useSyncExternalStore (not an effect), so
// there is no set-state-in-effect and no hydration mismatch: the server snapshot is "hidden", and the
// client swaps to the real value on hydration. Voice canon: plain, warm, no em/en dashes; tokens only.

// Bump this when the message materially changes, so a past dismissal does not hide the new notice.
const ALERT_KEY = 'site-alert:beta-2026-09-01'
// A same-tab signal so dismissing re-renders instantly (the native `storage` event is cross-tab only).
const DISMISS_EVENT = 'site-alert:dismissed'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(DISMISS_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(DISMISS_EVENT, onChange)
  }
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(ALERT_KEY) === '1'
  } catch {
    return false
  }
}

// Hidden on the server (and during the first client paint) so a dismissed viewer never sees a flash.
function serverSnapshot(): boolean {
  return true
}

export function SiteAlertBar() {
  const hidden = useSyncExternalStore(subscribe, isDismissed, serverSnapshot)

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(ALERT_KEY, '1')
    } catch {
      // Private mode / storage blocked: the bar just returns next load.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }, [])

  if (hidden) return null

  return (
    <div className="border-b border-primary/30 bg-primary-bg/70">
      <div className="mx-auto flex w-full max-w-[105rem] items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1 text-sm text-primary-strong">
          Hey Friends <span aria-hidden>👋🏼</span> Frequency will be in Beta until September 1st. Feel free to browse
          around, make some friends, and please report any bugs!
        </p>
        <ReportButton type="bug" label="Submit a bug" variant="chip" className="shrink-0" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss this announcement"
          className="shrink-0 rounded-lg p-1.5 text-primary-strong/80 transition-colors hover:bg-primary/10 hover:text-primary-strong"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
