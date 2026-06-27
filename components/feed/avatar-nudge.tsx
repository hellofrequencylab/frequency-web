'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Camera, X } from 'lucide-react'

// The "add your photo" nudge (ADR-421). The safety net for the onboarding-avatar
// flow: it shows for any signed-in member who has no avatar yet, catching EVERY way
// an avatar can fail to carry through signup (localStorage quota, a magic-link opened
// in a different browser, a transient upload error) — not just the quota case the
// downscale fix addresses. Dismissible (remembered locally so it never nags), and it
// disappears on its own once they add a photo. Gen-Z-friendly: calm, one tap, no guilt.
const DISMISS_KEY = 'fq_avatar_nudge_dismissed'

// Read the local dismissal flag the React-blessed way (no setState-in-effect). The
// snapshot is a stable primitive; the server snapshot assumes "not dismissed".
const noop = () => () => {}
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function AvatarNudge() {
  const persistedDismissed = useSyncExternalStore(noop, readDismissed, () => false)
  const [closed, setClosed] = useState(false)
  if (persistedDismissed || closed) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary-bg bg-primary-bg/40 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Camera className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">Add a profile photo</p>
        <p className="text-xs text-muted">A face helps your people recognize you. It takes one tap.</p>
      </div>
      <Link
        href="/settings/profile"
        className="shrink-0 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        Add photo
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            // ignore — worst case it shows again next load
          }
          setClosed(true)
        }}
        className="shrink-0 rounded-full p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
