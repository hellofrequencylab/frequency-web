'use client'

import { useEffect } from 'react'

// THE SITE INDEX POP-UP'S MODAL MANNERS (LIVE-1115). The pop-up itself is a native `popover` (it opens,
// closes on Escape and on an outside click with no script). This island adds the rest of what a modal
// dialog owes: focus moves to Close as it opens, Tab and Shift+Tab stay inside it, the page behind holds
// still, and closing hands focus back to the trigger. A link inside closes it too: the footer outlives a
// client navigation, so without that the index would stay open over the next page. Renders nothing.

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function MegaFooterDialog({ id }: { id: string }) {
  useEffect(() => {
    const pop = document.getElementById(id)
    if (!pop) return
    const trigger = document.querySelector<HTMLElement>(`[popovertarget="${id}"]:not([popovertargetaction="hide"])`)
    const html = document.documentElement
    let prevOverflow = ''
    // A link that closes the panel is a navigation: focus stays with the new page, not the old trigger.
    let leaving = false

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const all = [...pop.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
      if (!all.length) return
      const first = all[0]
      const last = all[all.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || !pop.contains(at))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (at === last || !pop.contains(at))) {
        e.preventDefault()
        first.focus()
      }
    }
    const onToggle = (e: Event) => {
      const open = (e as ToggleEvent).newState === 'open'
      if (open) {
        prevOverflow = html.style.overflow
        html.style.overflow = 'hidden'
        pop.querySelector<HTMLElement>('.fq-mf-x')?.focus()
        document.addEventListener('keydown', onTab)
      } else {
        html.style.overflow = prevOverflow
        document.removeEventListener('keydown', onTab)
        const at = document.activeElement
        if (!leaving && (!at || at === document.body || pop.contains(at))) trigger?.focus({ preventScroll: true })
        leaving = false
      }
    }
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest('a')) return
      leaving = true
      pop.hidePopover()
    }
    pop.addEventListener('toggle', onToggle)
    pop.addEventListener('click', onClick)
    return () => {
      pop.removeEventListener('toggle', onToggle)
      pop.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onTab)
      if (pop.matches(':popover-open')) html.style.overflow = prevOverflow
    }
  }, [id])
  return null
}
