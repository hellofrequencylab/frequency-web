'use client'

// The evolving card in the door's hero (design: templates/website/web/niche.js, "Hero card v6/v7"). It opens
// on one message, "Manage your practice", then the message lifts away and up to five feed items swing in
// from either side, 210ms apart, and keep jostling for a spot. It is decoration: aria-hidden, and under
// prefers-reduced-motion the items simply appear. The feed is built with the DOM on purpose: the jostle
// reorders live nodes with the Web Animations API (FLIP), which React's reconciler would fight.
import { useEffect, useRef, useState } from 'react'
import type { FqIconName } from '@/components/frequency/icon'

type Item = readonly [icon: FqIconName, title: string, line: string]

const SPRITE = '/brand/frequency/frequency-icons.svg'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SLOTS = 5
const START_MS = 3600

function iconNode(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'fq-icon')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `${SPRITE}#${name}`)
  svg.appendChild(use)
  return svg
}

function row(item: Item, side: 'l' | 'r'): HTMLDivElement {
  const el = document.createElement('div')
  el.className = `nk-ev nk-sw ${side}`
  const ri = document.createElement('span')
  ri.className = 'ri'
  ri.appendChild(iconNode(item[0]))
  const tx = document.createElement('span')
  tx.className = 'tx'
  const b = document.createElement('b')
  b.textContent = item[1]
  const s = document.createElement('small')
  s.textContent = item[2]
  tx.append(b, s)
  const em = document.createElement('em')
  em.textContent = 'now'
  el.append(ri, tx, em)
  return el
}

/** Newest row says "now", the one before "1 min", and so on up the list. */
function stamp(feed: HTMLElement) {
  const rows = Array.from(feed.querySelectorAll<HTMLElement>('.nk-ev'))
  rows.forEach((r, i) => {
    const m = rows.length - 1 - i
    const e = r.querySelector('em')
    if (e) e.textContent = m ? `${m} min` : 'now'
  })
}

function jostle(feed: HTMLElement) {
  const rows = Array.from(feed.querySelectorAll<HTMLElement>('.nk-ev'))
  if (rows.length < 3) return
  const i = Math.floor(Math.random() * (rows.length - 1))
  const a = rows[i]
  const b = rows[i + 1]
  const before = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]))
  feed.insertBefore(b, a)
  if (Math.random() < 0.35 && rows.length > 3) {
    const k = Math.floor(Math.random() * rows.length)
    feed.appendChild(feed.children[k])
  }
  rows.forEach((r) => {
    const dy = (before.get(r) ?? 0) - r.getBoundingClientRect().top
    if (!dy) return
    const tilt = (dy > 0 ? -1 : 1) * (1.2 + Math.random() * 1.6)
    r.animate(
      [
        { transform: `translateY(${dy}px) rotate(${tilt}deg) scale(1.03)` },
        {
          transform: `translateY(${dy * -0.06}px) rotate(${-tilt * 0.4}deg)`,
          offset: 0.7,
        },
        { transform: 'none' },
      ],
      {
        duration: 620 + Math.random() * 180,
        easing: 'cubic-bezier(.2,1.2,.35,1)',
      },
    )
  })
  rows.forEach((r) => {
    if (r === a || r === b) return
    r.animate(
      [
        { transform: 'none' },
        {
          transform: `translateX(${Math.random() * 6 - 3}px) rotate(${Math.random() * 1.4 - 0.7}deg)`,
        },
        { transform: 'none' },
      ],
      { duration: 420, easing: 'ease-out' },
    )
  })
  stamp(feed)
}

export function NicheHeroCard({ you, items }: { you: string; items: readonly Item[] }) {
  const root = useRef<HTMLDivElement>(null)
  const feed = useRef<HTMLDivElement>(null)
  const [go, setGo] = useState(false)
  const message = `Manage ${you.charAt(0).toLowerCase()}${you.slice(1)}`

  useEffect(() => {
    const f = feed.current
    const el = root.current
    if (!f || !el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: ReturnType<typeof setTimeout>[] = []
    let loop: ReturnType<typeof setTimeout> | undefined
    let shown = 0

    // The card sits level with the h1: the grid column is aligned to it, measured here once fonts settle.
    const align = () => {
      const hw = el.closest('.nk-hw')
      const text = hw?.querySelector('.nk-htx')
      const h1 = hw?.querySelector('h1')
      if (!text || !h1) return
      el.style.setProperty('--fq-h1y', `${h1.getBoundingClientRect().top - text.getBoundingClientRect().top}px`)
    }
    align()
    window.addEventListener('resize', align)
    void document.fonts?.ready.then(align)

    const push = () => {
      if (shown >= Math.min(SLOTS, items.length)) return
      const item = items[shown++]
      f.appendChild(row(item, shown % 2 ? 'l' : 'r'))
      stamp(f)
    }
    const again = () => {
      loop = setTimeout(
        () => {
          if (!document.hidden) jostle(f)
          again()
        },
        1900 + Math.random() * 1300,
      )
    }
    const start = () => {
      setGo(true)
      const n = Math.min(SLOTS, items.length)
      for (let q = 0; q < n; q++) timers.push(setTimeout(push, (reduced ? 0 : 420) + q * (reduced ? 0 : 210)))
      if (!reduced) timers.push(setTimeout(again, 420 + n * 210 + 900))
    }
    timers.push(setTimeout(start, reduced ? 200 : START_MS))

    return () => {
      timers.forEach(clearTimeout)
      if (loop) clearTimeout(loop)
      window.removeEventListener('resize', align)
      f.replaceChildren()
    }
  }, [items])

  return (
    <div ref={root} className={`nk-float${go ? ' go' : ''}`} aria-hidden="true">
      <div className="nk-fc">
        <span className="top">
          <span className="logo-s" />
          <span>
            <b>{you}</b>
            <small>
              <i className="nk-livedot" />
              Example activity
            </small>
          </span>
        </span>
        <div className="nk-stage">
          <div className="nk-msgw">
            <span className="nk-orb" />
            <b>{message}</b>
            <small>Example Space preview</small>
          </div>
          <div ref={feed} className="nk-feed" />
        </div>
      </div>
    </div>
  )
}
