'use client'

// THE AMBIENT LAYER (templates/members/app/ambient.js): four soft glow orbs and the grain, fixed behind
// the member shell. The kit draws them (`.fq-amb`, kit-members.css: the slow CSS drift, switched off
// under prefers-reduced-motion) from the --fq-amb-1..4 tokens in core.css. This island adds only the
// design's scroll parallax, one passive rAF-throttled listener, and none under reduced motion. The same
// frame drifts the background wash (`.fq-wash`, the shell's sibling) up by 6% of the scroll, capped at
// 90px, as the Feed prototype's `washRef` does (2026-10-14 export); its -12vh bleed hides the edge.
//
// ambient.js also drifts card photos inside their frames and reveals sections on scroll; those touch the
// page's own markup on every route and are left out on purpose.

import { useEffect, useRef } from 'react'

// [colour, size, left, top, parallax rate] — ambient.js `O`, line for line.
const ORBS = [
  ['var(--fq-amb-1)', '46vw', '-8%', '-6%', 0.1],
  ['var(--fq-amb-2)', '38vw', '78%', '10%', 0.22],
  ['var(--fq-amb-3)', '42vw', '58%', '62%', 0.16],
  ['var(--fq-amb-4)', '30vw', '4%', '70%', 0.3],
] as const

export function FqAmbient() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const orbs = Array.from(root.querySelectorAll<HTMLElement>('i'))
    const wash = root.parentElement?.querySelector<HTMLElement>(':scope > .fq-wash') ?? null
    let tick = 0
    const frame = () => {
      tick = 0
      const y = window.scrollY
      orbs.forEach((o, n) => {
        o.style.translate = `0 ${(-y * ORBS[n][4]).toFixed(1)}px`
      })
      if (wash) wash.style.translate = `0 ${Math.max(-90, -y * 0.06).toFixed(1)}px`
    }
    const on = () => {
      if (!tick) tick = requestAnimationFrame(frame)
    }
    frame()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(tick)
    }
  }, [])

  return (
    <div className="fq-amb" aria-hidden ref={ref}>
      {ORBS.map(([c, s, left, top]) => (
        <i key={c} style={{ '--fq-c': c, '--fq-s': s, left, top } as React.CSSProperties} />
      ))}
      <span className="fq-grain" />
    </div>
  )
}
