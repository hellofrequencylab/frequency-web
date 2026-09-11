'use client'

// Keeps the resolved mode true AFTER the first paint.
//
// The pre-paint bootstrap in app/layout.tsx gets the first frame right and then never runs again.
// Three things can invalidate its answer without a document load, and all three are ordinary on a
// phone:
//
//   · a CLIENT-SIDE navigation — /feed → /discover crosses into the public community lock, and no
//     inline script re-runs, so the `.dark` class would still be on the element from the last page;
//   · a VIEWPORT change — rotating a phone, or dragging a desktop window narrow, crosses the 768px
//     boundary the lock is defined against;
//   · an OS change — dusk, or a schedule, flipping `prefers-color-scheme` while a member is on
//     'system'. (The app shell used to own this listener alone, so it did not fire for a member
//     sitting on a public page outside the shell.)
//
// A fourth is rarer but real: another TAB. Signing out in one tab clears the account marker for
// every tab, and a member changing their mode in Settings should not leave a second tab behind.
// `storage` covers the preference; the marker is a cookie, which fires no event, so it is re-read
// on every one of the triggers above rather than watched.
//
// Mounted in the ROOT layout, so it covers the public tree and the member shell alike — this is the
// one component that has to see both. It renders null and imports only `next/navigation` plus the
// pure law, which is what keeps it honest in the place where every kilobyte is paid on every route.
//
// It NEVER writes the member's preference. The lock is a DOM override for as long as it applies;
// leave /discover, or turn the phone sideways, and the member's own mode comes straight back.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { syncMode } from '@/lib/theme/apply-mode'
import { THEME_STORAGE_KEY } from '@/lib/theme/mode'

export function ThemeModeSync() {
  const pathname = usePathname()

  useEffect(() => {
    // Re-resolve for the path we just landed on. Belt-and-braces with the bootstrap on a full load
    // (it already agrees); load-bearing on a client-side navigation, where nothing else re-decides.
    syncMode(pathname)

    const onSystemChange = () => syncMode(pathname)
    const onViewportChange = () => syncMode(pathname)
    const onStorage = (e: StorageEvent) => {
      // `key === null` is a whole-jar clear (another tab called localStorage.clear()).
      if (e.key === null || e.key === THEME_STORAGE_KEY) syncMode(pathname)
    }

    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    colorScheme.addEventListener('change', onSystemChange)
    window.addEventListener('resize', onViewportChange)
    // Rotation on iOS does not always fire `resize` before the new width is readable.
    window.addEventListener('orientationchange', onViewportChange)
    window.addEventListener('storage', onStorage)

    return () => {
      colorScheme.removeEventListener('change', onSystemChange)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('orientationchange', onViewportChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [pathname])

  return null
}
