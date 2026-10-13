'use client'

// THE PAGE MOTION of templates/website/web/side.js, for one page body:
//   1. pop-in reveals: every `.pop` card starts hidden (the kit holds it at opacity 0 until `.in`) and
//      springs in, one after another, as it scrolls into view. Without this the cards never show.
//   2. parallax: `[data-px]` elements drift against the scroll by their factor.
//   3. the `.phero` hero: the backdrop scales up and the copy lifts and fades as it scrolls away.
// It renders nothing and only touches elements inside the closest `[data-motion-scope]`. Reduced motion
// gets the cards at once and no movement. If the shell's side-state island does the same work, adding a
// class twice or writing the same transform twice is harmless.

import { useEffect, useRef } from 'react'

export function PageMotion() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const scope: ParentNode = ref.current?.closest('[data-motion-scope]') ?? document
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cleanups: (() => void)[] = []

    const pops = Array.from(scope.querySelectorAll<HTMLElement>('.pop:not(.in)'))
    if (rm || !('IntersectionObserver' in window)) {
      pops.forEach((el) => el.classList.add('in'))
    } else if (pops.length) {
      let last = 0
      const timers: number[] = []
      const io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue
            const el = en.target as HTMLElement
            const now = performance.now()
            const d = Math.max(0, last + 170 - now)
            last = now + d
            timers.push(window.setTimeout(() => el.classList.add('in'), d))
            io.unobserve(el)
          }
        },
        { threshold: 0.2, rootMargin: '0px 0px -6% 0px' },
      )
      pops.forEach((el) => io.observe(el))
      cleanups.push(() => {
        io.disconnect()
        timers.forEach((t) => window.clearTimeout(t))
      })
    }

    if (!rm) {
      const px = Array.from(scope.querySelectorAll<HTMLElement>('[data-px]'))
      const hero = scope.querySelector<HTMLElement>('.phero')
      const hb = hero?.querySelector<HTMLElement>('.bg') ?? null
      const hw = hero?.querySelector<HTMLElement>('.wrap') ?? null
      let queued = false
      const tick = () => {
        queued = false
        const vh = window.innerHeight
        for (const el of px) {
          const r = el.getBoundingClientRect()
          if (r.bottom < -200 || r.top > vh + 200) continue
          const c = (r.top + r.height / 2 - vh / 2) / vh
          el.style.translate = `0 ${(c * -Number(el.dataset.px) * 100).toFixed(1)}px`
        }
        if (hero) {
          const y = Math.max(0, -hero.getBoundingClientRect().top)
          const k = Math.min(1, y / (hero.offsetHeight * 0.7))
          if (hb) hb.style.transform = `scale(${1 + k * 0.12})`
          if (hw) {
            hw.style.opacity = String(1 - k * 0.9)
            hw.style.transform = `translate3d(0,${-y * 0.25}px,0)`
          }
        }
      }
      const req = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(tick)
      }
      window.addEventListener('scroll', req, { passive: true })
      window.addEventListener('resize', req, { passive: true })
      tick()
      cleanups.push(() => {
        window.removeEventListener('scroll', req)
        window.removeEventListener('resize', req)
      })
    }
    return () => cleanups.forEach((f) => f())
  }, [])
  return <span ref={ref} hidden />
}
