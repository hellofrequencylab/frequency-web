'use client'

import { useEffect } from 'react'

// THE TEMPLE KIT HEADER STATE (design: SiteHeader's `scrolled`, window.scrollY > 40). It marks the site root with
// data-scrolled; the skin's CSS collapses the announce bar to nothing, takes the bar from 84 to 72 and lifts it on a shadow.
// It draws nothing.

const AFTER_Y = 40

export function TempleKitHeaderState() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-house-theme="temple-kit"]')
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
