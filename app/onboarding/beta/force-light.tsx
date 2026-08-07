'use client'

// Hold the beta induction in light mode, and put the member's own theme back when they leave.
//
// ==========================================================================================
// WHY THIS IS NOT `localStorage.setItem('freq-theme', 'light')`
// ==========================================================================================
//
// That one line would work, and it would silently rewrite the member's site-wide preference from
// inside a funnel they are only passing through. Someone who runs the beta flow in dark mode would
// find the whole product in light mode afterwards and have no idea what changed it. The preference
// is theirs; this surface is only borrowing the presentation for five beats.
//
// So the override lives entirely in the DOM: drop the `.dark` class for the duration, and on
// unmount re-resolve the member's real preference from the storage key that was never touched.
// Nothing persists, and a hard refresh mid-flow lands in exactly the same place because the
// pre-paint script in `layout.tsx` re-applies it before anything is drawn.
//
// ==========================================================================================
// WHY THE RESTORE RE-READS RATHER THAN REMEMBERING
// ==========================================================================================
//
// The obvious version captures `wasDark` at mount and writes it back on unmount. That is wrong for
// the one case that matters: `freq-theme: 'system'`. If the OS flips to dark while someone is
// halfway through the induction (dusk, a schedule, a manual toggle), the captured boolean restores
// the stale answer and the member lands in the wrong mode. Re-running the same resolution the
// pre-paint script runs — stored choice first, `prefers-color-scheme` when that choice is
// 'system' — is always current by construction.

import { useEffect } from 'react'

/**
 * Mirrors `--color-canvas` / `--color-ink`, the same pair app/layout.tsx pins pre-paint.
 *
 * Exported because `layout.tsx` interpolates the light one into its inline script. One definition
 * for both halves of this override: a `<meta name="theme-color">` cannot read a CSS variable, so
 * the value has to exist as a literal somewhere, and the only thing worse than one literal is the
 * same literal in two files drifting apart.
 */
export const THEME_COLOR_LIGHT = '#FBFAF6' // token-ok: browser chrome; set via JS before CSS applies
export const THEME_COLOR_DARK = '#16130E' // token-ok: browser chrome; set via JS before CSS applies

/** The member's real preference, resolved exactly as the pre-paint script resolves it. */
function prefersDark(): boolean {
  try {
    const stored = localStorage.getItem('freq-theme')
    if (stored === 'dark') return true
    if (stored === 'light') return false
    return window.matchMedia('(prefers-color-scheme:dark)').matches
  } catch {
    // A blocked storage jar (private mode, a strict cookie policy) is not a reason to strand
    // someone in the wrong theme. Fall back to the OS, which needs no storage to read.
    try {
      return window.matchMedia('(prefers-color-scheme:dark)').matches
    } catch {
      return false
    }
  }
}

function setThemeColor(dark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT)
}

export function ForceLight() {
  useEffect(() => {
    // Belt and braces with the pre-paint script in layout.tsx. That script covers the first paint
    // of a full page load; this covers a CLIENT-SIDE navigation into the funnel, where no inline
    // script re-runs and the class would otherwise still be on the element from the previous page.
    document.documentElement.classList.remove('dark')
    setThemeColor(false)

    return () => {
      const dark = prefersDark()
      document.documentElement.classList.toggle('dark', dark)
      setThemeColor(dark)
    }
  }, [])

  return null
}
