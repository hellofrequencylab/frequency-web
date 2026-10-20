'use client'

import { useEffect } from 'react'

// THE FOOTER'S LIFT (LIVE-1030). Publishes `--fq-foot-lift` on <html>: how many px of the OPEN mega footer
// stand above the window's bottom edge, so the two bottom docks can rest on its top edge. Closed, it is 0
// and the docks stay stuck to the window's bottom. Capped at 55% of the window so a tall index never
// carries a dock off the top of the screen.
//
// A dock reads it as `bottom: var(--fq-foot-lift, 0px)`. Renders nothing. Opening the footer also scrolls
// it into view, so the index the member just asked for is not left below the fold.

const VAR = '--fq-foot-lift'
const CAP = 0.55

export function MegaFooterLift() {
  useEffect(() => {
    const root = document.documentElement
    const footer = document.querySelector<HTMLElement>('footer.fq-mf')
    const details = footer?.querySelector('details')
    if (!footer || !details) return
    let frame = 0
    const measure = () => {
      frame = 0
      const vh = window.innerHeight
      const top = footer.getBoundingClientRect().top
      const lift = details.open ? Math.min(Math.max(0, vh - top), vh * CAP) : 0
      root.style.setProperty(VAR, `${Math.round(lift)}px`)
      if (details.open) root.dataset.footOpen = ''
      else delete root.dataset.footOpen
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const onToggle = () => {
      schedule()
      if (details.open) requestAnimationFrame(() => footer.scrollIntoView({ block: 'end', behavior: 'smooth' }))
    }
    details.addEventListener('toggle', onToggle)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      details.removeEventListener('toggle', onToggle)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      root.style.removeProperty(VAR)
      delete root.dataset.footOpen
    }
  }, [])
  return null
}
