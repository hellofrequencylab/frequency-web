'use client'

import { useEffect } from 'react'

// THE DESIGNER HEADER STATE (design: the header is clear over a hero and solid after the page scrolls 60px). It
// marks the site root with data-scrolled; the skin's CSS does the rest. It draws nothing.

export function DesignerHeaderState() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-house-theme="designer"]')
    if (!root) return
    const set = () => { if (window.scrollY > 60) root.setAttribute('data-scrolled', ''); else root.removeAttribute('data-scrolled') }
    set()
    window.addEventListener('scroll', set, { passive: true })
    return () => window.removeEventListener('scroll', set)
  }, [])
  return null
}
