'use client'

import { useEffect, useRef } from 'react'
import { BRIEF_HTML } from './brief-html'
import { computeBrief, briefValue, isBriefKey, BRIEF_DEFAULTS, type BriefState } from '@/lib/how/brief-calc'
import { startBriefTracker } from './brief-tracker'
import { startBriefMotion } from './brief-motion'
import './brief.css'

// The brief is authored as one static document (brief-html.ts, generated from the design) and
// hydrated here: sliders drive the two calculators, the side rail follows the reader, and the
// tracker records engagement. Server-rendered with the default numbers, so first paint is complete.
export function HowBrief() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    const root = host?.querySelector<HTMLElement>('.ov-root')
    if (!host || !root) return
    const state: BriefState = { ...BRIEF_DEFAULTS }
    const tracker = startBriefTracker(root)

    // ── calculators ─────────────────────────────────────────────────────────
    const textHoles = Array.from(root.querySelectorAll<HTMLElement>('[data-b]'))
    const styleHoles = Array.from(root.querySelectorAll<HTMLElement>('[data-s]'))
    const render = () => {
      const r = computeBrief(state)
      for (const el of textHoles) el.textContent = briefValue(r, el.dataset.b ?? '')
      for (const el of styleHoles) {
        const tpl = el.dataset.s ?? ''
        el.setAttribute('style', tpl.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => briefValue(r, k)))
      }
      return r
    }
    const onInput = (e: Event) => {
      const input = e.target as HTMLInputElement
      const key = input.dataset.k
      if (!key || !isBriefKey(key)) return
      state[key] = Number(input.value)
      const r = render()
      const calc = input.closest('#region') ? 'region' : 'growth'
      tracker.calc(calc, key, state[key], calc === 'region' ? r.o.total : r.o.months)
    }
    root.addEventListener('input', onInput)

    // ── side rail + the idle spin-down of the "Groups fade" loop (brief-motion.ts) ──
    const stopMotion = startBriefMotion(root)

    return () => {
      root.removeEventListener('input', onInput)
      stopMotion()
      tracker.stop()
    }
  }, [])

  return (
    <>
      <div ref={ref} className="w-full" dangerouslySetInnerHTML={{ __html: BRIEF_HTML }} />
    </>
  )
}
