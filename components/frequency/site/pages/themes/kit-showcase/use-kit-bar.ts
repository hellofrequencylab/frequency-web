'use client'
// The /themes kit bar on a phone (speed + screen room, 2026-11-19). Under 900px the bar holds the look, register and ready filters
// and takes about half the screen, so scrolling down folds it to its last row (the kit chips) and scrolling up, or moving focus
// into it, brings the filters back. It slides with a transform, so nothing below it moves. Wider screens keep the one-row bar as is.
// It follows the site header's own rule (site-header.tsx: down more than 6px a frame hides, up more than 6px shows), so the header
// and the bar leave and return together; kit-showcase.css sits the bar under the header through --fq-site-nav-h.
import { useEffect } from 'react'

const PHONE = '(max-width: 899px)'
/** Pixels a frame, the site header's own threshold, so a finger's wobble does not flicker either of them. */
const SLACK = 6

export function useKitBarFold() {
  useEffect(() => {
    const bar = document.getElementById('kits')
    const mq = window.matchMedia(PHONE)
    if (!bar) return
    let lastY = window.scrollY
    let raf = 0
    const fold = (on: boolean) => {
      if (on === bar.hasAttribute('data-min')) return
      if (on) {
        const nav = bar.querySelector('nav')
        if (!nav) return
        // The kit chips are the bar's last row: keep them and a little of the bar's padding on screen.
        bar.style.setProperty('--ks-bar-shift', `-${Math.max(0, nav.offsetTop - 8)}px`)
        bar.setAttribute('data-min', '')
      } else bar.removeAttribute('data-min')
    }
    const tick = () => {
      raf = 0
      const y = window.scrollY
      const dy = y - lastY
      lastY = y
      if (!mq.matches) return fold(false)
      // Until the hero above it has scrolled away the bar is in its own place, so it stays whole.
      const hero = bar.previousElementSibling
      if (!hero || hero.getBoundingClientRect().bottom > 0) return fold(false)
      if (dy > SLACK) fold(true)
      else if (dy < -SLACK) fold(false)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onFocus = () => fold(false)
    const onMq = () => { if (!mq.matches) fold(false) }
    window.addEventListener('scroll', onScroll, { passive: true })
    bar.addEventListener('focusin', onFocus)
    mq.addEventListener('change', onMq)
    return () => {
      window.removeEventListener('scroll', onScroll)
      bar.removeEventListener('focusin', onFocus)
      mq.removeEventListener('change', onMq)
      if (raf) cancelAnimationFrame(raf)
      fold(false)
    }
  }, [])
}
