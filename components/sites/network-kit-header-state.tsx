'use client'

import { useEffect } from 'react'

// THE NETWORK THEME KIT HEADER STATE (design: the announce bar folds away and the header bar shrinks 12px once the page
// scrolls 40px). It marks the site root with data-scrolled; the skin's CSS does the rest. It draws nothing.

export function NetworkKitHeaderState() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-house-theme="network-kit"]')
    if (!root) return
    const set = () => { if (window.scrollY > 40) root.setAttribute('data-scrolled', ''); else root.removeAttribute('data-scrolled') }
    set()
    window.addEventListener('scroll', set, { passive: true })
    return () => window.removeEventListener('scroll', set)
  }, [])
  return null
}
