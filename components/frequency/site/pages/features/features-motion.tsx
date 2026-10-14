'use client'

// The Features page's own script (templates/website/Features.html, inline): a `#f-…` link opens that
// feature and scrolls to it, the sticky jump bar lights the half you are reading, and opening a feature
// writes its anchor into the URL so it can be shared. Renders nothing.

import { useEffect } from 'react'

export function FeaturesMotion() {
  useEffect(() => {
    const openFromHash = () => {
      const h = window.location.hash
      if (!h.startsWith('#f-')) return
      const d = document.getElementById(h.slice(1))
      if (!(d instanceof HTMLDetailsElement)) return
      d.open = true
      window.setTimeout(() => window.scrollTo({ top: d.getBoundingClientRect().top + window.scrollY - 170 }), 60)
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-j]'))
    const spaces = document.getElementById('spaces')
    const tick = () => {
      const on = spaces && spaces.getBoundingClientRect().top < window.innerHeight * 0.35 ? 'spaces' : 'people'
      links.forEach((a) => a.classList.toggle('on', a.dataset.j === on))
    }
    window.addEventListener('scroll', tick, { passive: true })
    tick()

    const onToggle = (e: Event) => {
      const d = e.target
      if (d instanceof HTMLDetailsElement && d.classList.contains('ft') && d.open && d.id) {
        window.history.replaceState(null, '', `#${d.id}`)
      }
    }
    document.addEventListener('toggle', onToggle, true)

    return () => {
      window.removeEventListener('hashchange', openFromHash)
      window.removeEventListener('scroll', tick)
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [])
  return null
}
