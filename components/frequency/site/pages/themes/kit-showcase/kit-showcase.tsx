'use client'
// The Theme Kits page's client shell (LIVE-2188): holds the page state (use-kit-showcase.ts) and draws the design's markup
// (kit-showcase-view.tsx) on the Stage surface the marketing site already wears.
import './kit-showcase.css'
import { KIT_FONT_SHEET } from './data'
import { KitShowcaseView } from './kit-showcase-view'
import { useKitShowcase, type ShowcaseLinks } from './use-kit-showcase'

export function KitShowcase({ links }: { links: ShowcaseLinks }) {
  const v = useKitShowcase({ links })
  return (
    <div data-theme="stage" className="ks-stage">
      <link rel="stylesheet" href={KIT_FONT_SHEET} precedence="default" />
      <div className="fq-grain ks-grain" aria-hidden="true" />
      <KitShowcaseView {...v} />
    </div>
  )
}
