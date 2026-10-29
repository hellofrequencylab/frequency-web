'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { referrerPath, safeReturnPath } from '@/lib/launch/lightbox'

// THE LAUNCH LIGHTBOX (LIVE-1913). Every launch page (/launch and its steps) opens as a full-screen overlay, the
// shared Dialog at align="overlay": focus trap, Esc, scroll lock and focus return come with it. The close control
// is Pause, never a hard exit: it returns the person to the page they came from (a `from` path, else the page that
// sent them, kept for the length of the tab), and the launch box and clock pick up where they stopped. Photos and
// every other ask stay skippable inside; this only changes the frame. Client island, small on purpose.

const KEY = 'fq_launch_from'

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Where Pause goes: the explicit `from`, else what this tab remembered, else the same-origin referrer of the first
 *  arrival. The first answer is remembered so a hop between launch steps does not lose it. */
function resolveReturn(from: string | null): string {
  if (from) return safeReturnPath(from)
  const kept = readStored()
  if (kept) return safeReturnPath(kept)
  return safeReturnPath(referrerPath(document.referrer, window.location.origin))
}

export function LaunchLightbox({ children }: { children: ReactNode }) {
  const router = useRouter()
  const from = useSearchParams().get('from')
  const [open, setOpen] = useState(true)

  // Remember the first return path for the tab (browser-only, wrapped: private windows can throw).
  const [back] = useState(() => {
    if (typeof window === 'undefined') return '/'
    const target = resolveReturn(from)
    try {
      if (!window.sessionStorage.getItem(KEY)) window.sessionStorage.setItem(KEY, target)
    } catch {
      // storage unavailable: the path still works for this page view
    }
    return target
  })

  const pause = useCallback(() => {
    setOpen(false)
    router.push(back)
  }, [router, back])

  return (
    <Dialog open={open} onClose={pause} align="overlay" ariaLabelledBy="launch-lightbox-title" className="w-full">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--fq-radius-l,24px)] bg-canvas shadow-xl" data-kit="members">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <span id="launch-lightbox-title" className="font-display text-base tracking-tight">
            Frequency <span className="t2">· Launch</span>
          </span>
          <button type="button" className="btn txt sm" onClick={pause} aria-label="Pause the launch and go back">
            Pause <span aria-hidden>✕</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">{children}</div>
      </div>
    </Dialog>
  )
}
