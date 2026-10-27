'use client'

import { useEffect } from 'react'

// THE DESIGNER HERO PARALLAX (handoff: the photo drifts at 0.12x the scroll, capped at 80px, and stops under
// prefers-reduced-motion). It moves the page's hero photos and draws nothing itself.

export function DesignerParallax() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const photos = Array.from(document.querySelectorAll<HTMLElement>('[data-house-theme="designer"] .dz-hero-photo'))
    let frame = 0
    const move = () => {
      frame = 0
      const y = Math.min(window.scrollY * 0.12, 80)
      for (const el of photos) el.style.transform = `scale(1.04) translateY(${y}px)`
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(move) }
    window.addEventListener('scroll', onScroll, { passive: true })
    move()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
