'use client'

import { useEffect } from 'react'

// The design system's scroll "wave" (LIVE-864, HANDOFF "Interactions summary"): as the page scrolls, the
// rail link for the section in view gets full weight and its neighbours glow by distance (a smoothstep
// falloff), written as `--w` per link; the CSS mixes colours by it. `toc` is the Executive Overview's
// contents (the active one also gets `--a` and aria-current); `months` is the Yearly Calendar's month grid,
// where the month scrolled into view is also marked current. Renders nothing; the links are server HTML.

export function ScrollWave({ mode }: { mode: 'toc' | 'months' }) {
  useEffect(() => {
    const attr = mode === 'toc' ? 'data-nav' : 'data-mk'
    let raf = 0
    const update = () => {
      raf = 0
      const links = [...document.querySelectorAll<HTMLElement>(`[${attr}]`)]
      if (!links.length) return
      const secs = links.map((l) => document.getElementById(l.getAttribute(attr) ?? ''))
      const line = window.innerHeight * (mode === 'toc' ? 0.35 : 0.3)
      let pos = -1
      let active = -1
      secs.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.top <= line) {
          active = i
          pos = i + Math.min(1, (line - r.top) / Math.max(1, r.height)) - 0.5
        }
      })
      if (mode === 'toc') {
        if (active < 0 && secs[0]) {
          const r = secs[0].getBoundingClientRect()
          pos = -0.5 - Math.min(1.5, (r.top - line) / window.innerHeight)
        }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          active = secs.length - 1
          pos = active
        }
      }
      const reach = mode === 'toc' ? 2.4 : 2.2
      links.forEach((l, j) => {
        const w = Math.max(0, 1 - Math.abs(j - pos) / reach)
        const e = w * w * (3 - 2 * w)
        const weight = mode === 'toc' ? (j === active ? Math.max(e, 0.92) : e * 0.7) : e * 0.85
        l.style.setProperty('--w', weight.toFixed(3))
        if (mode === 'toc') l.style.setProperty('--a', j === active ? '1' : '0')
        if (j === Math.max(active, 0)) l.setAttribute('aria-current', 'true')
        else l.removeAttribute('aria-current')
      })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    const t = window.setTimeout(on, 60)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      window.clearTimeout(t)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [mode])
  return null
}
