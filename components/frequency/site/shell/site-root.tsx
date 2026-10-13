'use client'

// THE KIT ROOT of the Frequency public site (templates/website/web/side.js + the README's page state).
//
// The prototype hangs its state on <body>: data-side, data-lock, data-mood, data-energy-page and the
// mood hues. Here they hang on ONE element, `<div data-kit="site">`, because app/themes/frequency/
// kit-site.css is scoped to `[data-design="frequency"] [data-kit="site"]` and the root layout owns
// <body>. `data-surface="stage"` sits beside it so the Stage tokens apply (ADR-1740).
//
// The page state is resolved from the pathname (lib/frequency/site-pages.ts), so the server renders the
// right attributes in the first paint; `usePathname` keeps static rendering static. A page can override
// it with <SitePage/> (site-page.tsx).
//
// SIDE STATE, as side.js runs it: Home is the only unlocked page. There a click on any `[data-set="p|e"]`
// sets the side, it is remembered in localStorage['fq-home-side'] and written to the URL as `#people` /
// `#experiences`, and `#people` / `#spaces` / `#experiences` in the URL choose it on arrival. Every `[data-set]` gets `aria-pressed`. Server-rendered page bodies need no
// client code for the toggle: the buttons carry `data-set`, and the CSS does the rest
// (`.p-only` / `.e-only`, `.sw .thumb`, `--fq-side`).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import type { Side } from '@/lib/frequency/site-nav'
import { moodStyle, resolveSitePage, type SitePageState } from '@/lib/frequency/site-pages'

export const SIDE_STORAGE_KEY = 'fq-home-side'

interface SiteState {
  page: SitePageState
  side: Side
  /** Sets the side. A locked page ignores it, as side.js does. */
  setSide: (side: Side) => void
  /** Overrides the page row after hydration (SitePage). `null` returns to the table. */
  setOverride: (override: Partial<SitePageState> | null) => void
}

const SiteContext = createContext<SiteState | null>(null)

/** The public site's state: the page row, the side, and the setter. Throws outside the Frequency shell. */
export function useSite(): SiteState {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite() is only available inside the Frequency site shell')
  return ctx
}

/** The current side and its setter, for client components on the public site. */
export function useSiteSide(): [Side, (side: Side) => void, boolean] {
  const { side, setSide, page } = useSite()
  return [side, setSide, page.locked]
}

// ── The chosen side: a tiny external store, so the server snapshot (null) hydrates cleanly and the
// browser's answer (URL hash on arrival, else localStorage) replaces it without an effect. ──────────
let chosenSide: Side | null | undefined
const sideListeners = new Set<() => void>()

function readChosenSide(): Side | null {
  if (chosenSide !== undefined) return chosenSide
  const h = window.location.hash
  let s: Side | null = h === '#people' ? 'p' : h === '#spaces' || h === '#experiences' ? 'e' : null
  if (!s) {
    try {
      const v = window.localStorage.getItem(SIDE_STORAGE_KEY)
      s = v === 'p' || v === 'e' ? v : null
    } catch {
      s = null
    }
  }
  chosenSide = s
  return s
}

function writeChosenSide(next: Side) {
  chosenSide = next
  try {
    window.localStorage.setItem(SIDE_STORAGE_KEY, next)
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit.
  }
  sideListeners.forEach((l) => l())
}

function subscribeSide(listener: () => void) {
  sideListeners.add(listener)
  return () => {
    sideListeners.delete(listener)
  }
}

export function SiteRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [override, setOverride] = useState<Partial<SitePageState> | null>(null)
  const page = useMemo(() => ({ ...resolveSitePage(pathname), ...override }), [pathname, override])
  const chosen = useSyncExternalStore(subscribeSide, readChosenSide, () => null)
  const side: Side = page.locked ? page.side : (chosen ?? page.side)

  const setSide = useCallback(
    (next: Side) => {
      if (!page.locked) writeChosenSide(next)
    },
    [page.locked],
  )

  // Any [data-set] button anywhere on the page, server-rendered or not.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-set]') as HTMLElement | null
      const v = el?.dataset.set
      if (v !== 'p' && v !== 'e') return
      setSide(v)
      // Home.html's setSide: the URL says which side you are reading, so a shared link opens on it.
      if (!page.locked) {
        const hash = v === 'p' ? '#people' : '#experiences'
        if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [setSide, page.locked])

  // aria-pressed follows the side on every toggle, including ones a new page just rendered.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-kit="site"] [data-set]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el.dataset.set === side))
    })
  }, [side, pathname])

  // Overrides belong to the page that set them: SitePage clears its own on unmount.
  const value = useMemo<SiteState>(() => ({ page, side, setSide, setOverride }), [page, side, setSide])

  return (
    <SiteContext.Provider value={value}>
      <div
        data-surface="stage"
        data-kit="site"
        data-side={side}
        data-lock={page.locked ? side : undefined}
        data-mood={page.mood}
        data-energy-page={page.energy}
        data-fx-quiet={page.quiet}
        className="fq-site"
        style={moodStyle(page) as React.CSSProperties}
      >
        {children}
      </div>
    </SiteContext.Provider>
  )
}
