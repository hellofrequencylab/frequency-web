'use client'

// HOME'S SCROLL STORY, ported from the two inline scripts at the end of templates/website/Home.html:
//   1. the fold (§02): a 440vh pinned stage where six photos drift and scale, three lines of the vision
//      fade through in turn, and the two path doors spring in. Marks the section `data-live`, which is
//      what switches site-pages-a.css from the static (no-JS, reduced-motion) layout to the pinned one.
//   2. the hero lifts and fades as it scrolls away, its backdrop scaling up.
//   3. the "Live this week" figure counts up once when it comes into view.
// `[data-px]` parallax (chapter rings and photos, `.rings.big` kept centred) and the dock are the shell's
// FX loop (components/frequency/site/shell/site-fx.tsx), so they are not run twice here.
// Renders nothing; all of it is skipped under prefers-reduced-motion. The path doors are links to the beta entry
// (/join) since SCAN-885, so the old door-to-story scroll is gone.
//
// NOT PORTED: the design's "gate" (body.gated), which hid everything below the fold until a door was
// chosen. A server-rendered page that hides its own content until a click hides it from crawlers and
// from anyone without JS, so the story is always there.

import { useEffect, useRef } from 'react'

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const range = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const ease = (x: number) => 1 - Math.pow(1 - x, 3)

export function HomeMotion() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const scope: ParentNode = ref.current?.closest('[data-motion-scope]') ?? document
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cleanups: (() => void)[] = []

    const fold = scope.querySelector<HTMLElement>('#fold')
    if (!rm) {
      const hero = scope.querySelector<HTMLElement>('.hero')
      const hw = hero?.querySelector<HTMLElement>(':scope > .wrap') ?? null
      const hb = hero ? Array.from(hero.querySelectorAll<HTMLElement>(':scope > .bg')) : []
      const ph = fold ? Array.from(fold.querySelectorAll<HTMLElement>('.fl-ph')) : []
      const tx = fold ? Array.from(fold.querySelectorAll<HTMLElement>('[data-in]')) : []
      const fork = fold?.querySelector<HTMLElement>('.fl-fork') ?? null
      const doors = fold ? Array.from(fold.querySelectorAll<HTMLElement>('.pdw')) : []
      fold?.setAttribute('data-live', '')

      const tick = () => {
        const vh = window.innerHeight
        if (fold) {
          const r = fold.getBoundingClientRect()
          const p = clamp(-r.top / (r.height - vh))
          for (const el of ph) {
            const d = Number(el.dataset.d)
            el.style.transform = `translate3d(0,${(0.08 - p) * d * vh * 0.55}px,0) scale(${1 + p * d * 0.06})`
            el.style.opacity = String(1 - range(p, 0.55, 0.7) * 0.85)
          }
          for (const el of tx) {
            const [a, b] = (el.dataset.in ?? '0 1').split(' ').map(Number)
            let o = ease(range(p, a, b))
            let y = (1 - o) * 40
            if (el.dataset.out) {
              const [c, d] = el.dataset.out.split(' ').map(Number)
              const q = range(p, c, d)
              o *= 1 - q
              y -= q * 40
            }
            el.style.opacity = String(o)
            el.style.transform = `translate3d(0,${y}px,0)`
          }
          doors.forEach((d, i) => {
            d.classList.toggle('in', p > (i ? 0.72 : 0.64))
            d.style.translate = `0 ${(0.9 - p) * (i ? 190 : 110)}px`
          })
          fork?.classList.toggle('fl-on', p > 0.6)
        }
        if (hero) {
          const y = Math.max(0, -hero.getBoundingClientRect().top)
          const k = clamp(y / (hero.offsetHeight * 0.55))
          if (hw) {
            hw.style.opacity = String(1 - k)
            hw.style.transform = `translate3d(0,${-y * 0.35}px,0) scale(${1 - k * 0.06})`
          }
          hb.forEach((b) => (b.style.transform = `scale(${1 + k * 0.12})`))
        }
      }
      let queued = false
      const req = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          tick()
        })
      }
      window.addEventListener('scroll', req, { passive: true })
      window.addEventListener('resize', req, { passive: true })
      tick()
      cleanups.push(() => {
        window.removeEventListener('scroll', req)
        window.removeEventListener('resize', req)
        fold?.removeAttribute('data-live')
      })

      const n = scope.querySelector<HTMLElement>('[data-count]')
      if (n && 'IntersectionObserver' in window) {
        const to = Number(n.dataset.count)
        let raf = 0
        const io = new IntersectionObserver(
          (es) => {
            if (!es[0]?.isIntersecting) return
            io.disconnect()
            const start = performance.now()
            const step = (now: number) => {
              const k = Math.min(1, (now - start) / 1400)
              n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US')
              if (k < 1) raf = requestAnimationFrame(step)
            }
            raf = requestAnimationFrame(step)
          },
          { threshold: 0.5 },
        )
        io.observe(n)
        cleanups.push(() => {
          io.disconnect()
          cancelAnimationFrame(raf)
          n.textContent = to.toLocaleString('en-US')
        })
      }
    }
    return () => cleanups.forEach((f) => f())
  }, [])
  return <span ref={ref} hidden />
}
