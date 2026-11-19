'use client'
// The Theme Kits page's client shell (LIVE-2188): holds the page state (use-kit-showcase.ts) and draws the design's markup
// (kit-showcase-view.tsx) on the Stage surface the marketing site already wears.
import './kit-showcase.css'
import { useEffect } from 'react'
import { preconnect } from 'react-dom'
import { KIT_FONT_SHEET } from './data'
import { KitShowcaseView } from './kit-showcase-view'
import { useKitBarFold } from './use-kit-bar'
import { useKitShowcase, type ShowcaseLinks } from './use-kit-showcase'

/** The kits' own faces (21 families) only dress the kit sections, never the first screen, so the sheet loads after the page
 *  is up instead of holding the first paint on a phone (speed, 2026-11-19). Text shows in its fallback until then. */
function useKitFonts() {
  preconnect('https://fonts.googleapis.com')
  preconnect('https://fonts.gstatic.com', { crossOrigin: 'anonymous' })
  useEffect(() => {
    if (document.querySelector(`link[href="${KIT_FONT_SHEET}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = KIT_FONT_SHEET
    document.head.appendChild(link)
  }, [])
}

export function KitShowcase({ links }: { links: ShowcaseLinks }) {
  const v = useKitShowcase({ links })
  useKitFonts()
  useKitBarFold()
  return (
    <div data-theme="stage" className="ks-stage">
      <div className="fq-grain ks-grain" aria-hidden="true" />
      <KitShowcaseView {...v} />
    </div>
  )
}
