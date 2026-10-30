'use client'

import { useEffect } from 'react'

// THE FREE HUMAN HEADER STATE. It marks the site root with data-scrolled once the page is past the top (window.scrollY > 40);
// the skin's CSS then folds the announce bar away and takes the header from 78 to 64 on a soft shadow, so the menu stays in
// reach and gives the page its room back. It draws nothing. Same shape as the Temple Kit's (temple-kit-header-state.tsx).

const AFTER_Y = 40

export function FreeHumanHeaderState() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-house-theme="free-human"]')
    if (!root) return
    const set = () => {
      if (window.scrollY > AFTER_Y) root.setAttribute('data-scrolled', '')
      else root.removeAttribute('data-scrolled')
    }
    set()
    window.addEventListener('scroll', set, { passive: true })
    return () => window.removeEventListener('scroll', set)
  }, [])
  return null
}
