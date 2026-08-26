'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'

// ANNOUNCEMENT BAR - the full-width strip directly below the signed-in header, carrying whatever the
// operator wrote in `platform_settings.announcement_message` (resolved by `announcementBannerState()`
// in components/layout/announcement-banner.tsx).
//
// 🔴 IT CARRIES NO SENTENCE OF ITS OWN, AND THAT IS THE POINT. This was the beta strip, and it said
// "Frequency will be in Beta until September 1st" in a string literal, on the marketing tree, the
// help centre, /discover and the public Space twins - every indexable surface the site has. Copy that
// lives in a component outlives the thing it describes, which is the same defect ADR-1060 recorded
// for the countdown banner: the component knew the sentence, so retiring the sentence needed a
// deploy. Now it knows nothing. An unset message renders nothing at all, which is the state the
// platform is in the moment this ships.
//
// 🔴 SIGNED-IN ONLY. It mounts through `AppShell`'s `banner` slot and nowhere else. A visitor reading
// /help or a Space's public page is not the audience for an operational notice, and a notice on those
// routes is a notice in Google's index.
//
// DISMISSAL IS KEYED TO THE WORDS. The old bar used a hand-bumped `ALERT_KEY` constant, so editing
// the copy without remembering to bump it left the new announcement hidden from everyone who had
// dismissed the old one - silent, and visible only to someone who had never dismissed. The key is now
// derived from the message itself, so new words are a new key by construction.
//
// The dismissal lives in localStorage and is read through useSyncExternalStore (not an effect), so
// there is no set-state-in-effect and no hydration mismatch: the server snapshot is "hidden", and the
// client swaps to the real value on hydration.

// A same-tab signal so dismissing re-renders instantly (the native `storage` event is cross-tab only).
const DISMISS_EVENT = 'announcement:dismissed'

/** djb2 over the announcement's WORDS. Not a security hash - just a short, stable id so the dismissal
 *  key changes exactly when the message does.
 *
 *  Deliberately NOT over the countdown: that label changes every midnight, so folding it in would
 *  resurrect a dismissed announcement once a day for as long as its deadline stood. */
function keyFor(message: string): string {
  let h = 5381
  for (let i = 0; i < message.length; i += 1) h = ((h << 5) + h + message.charCodeAt(i)) | 0
  return `announcement:${(h >>> 0).toString(36)}`
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(DISMISS_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(DISMISS_EVENT, onChange)
  }
}

// Hidden on the server (and during the first client paint) so a dismissed viewer never sees a flash.
function serverSnapshot(): boolean {
  return true
}

/** THE BAR READS NO CLOCK. `countLabel` arrives already rendered ("3 days left") because the caller is
 *  a Server Component holding the deadline anyway, and a date turned into words on the client is two
 *  bugs waiting: react-hooks/purity rejects a `Date.now()` in render, and a countdown computed once on
 *  the server and again in the browser disagrees across a midnight boundary - a hydration mismatch on
 *  exactly the day the number matters most. It is decoration either way: the message is the
 *  announcement, and `announcementBannerState()` has already dropped a date that has passed. */
export function AnnouncementBar({ message, countLabel = null }: { message: string; countLabel?: string | null }) {
  const storageKey = keyFor(message)

  const isDismissed = useCallback((): boolean => {
    try {
      return window.localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  }, [storageKey])

  const hidden = useSyncExternalStore(subscribe, isDismissed, serverSnapshot)

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // Private mode / storage blocked: the bar just returns next load.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }, [storageKey])

  if (hidden || !message.trim()) return null

  return (
    <div role="status" className="border-b border-primary/30 bg-primary-bg/70">
      {/* The message + countdown are centered as one group; the dismiss X is pinned right so it never
          offsets that centering. The horizontal padding clears the pinned X. */}
      <div className="relative mx-auto flex w-full max-w-[105rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-12 py-2">
        <p className="text-center text-body-sm text-primary-strong">{message}</p>
        {countLabel && (
          <span className="shrink-0 rounded-pill bg-primary/10 px-2.5 py-1 text-meta font-semibold text-primary-strong tabular-nums">
            {countLabel}
          </span>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss this announcement"
          className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0 rounded-lg p-1.5 text-primary-strong/80 transition-colors hover:bg-primary/10 hover:text-primary-strong sm:right-4"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
