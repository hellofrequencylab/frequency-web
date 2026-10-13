'use client'

// THE WEAVE CHART (Home §05), ported from Home.html's inline script. A 3 x 6 grid of steps (People,
// Together, Spaces across six stages) with SVG threads drawn between them from their measured positions.
// Hovering a step lights its column and the threads through it; the caption below tells that stage from
// the side the visitor is on. Clicking a People or Spaces step switches side through the shell's own
// `[data-set]` handling, which is why those buttons carry `data-set`.
//
// The side is READ from the kit root (`[data-kit="site"][data-side]`, owned by the shell lane) and
// followed with a MutationObserver, so this island never holds a second copy of it.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import type { WeaveStage } from './weave-data'

type Row = 'p' | 'm' | 'e'
type Side = 'p' | 'e'
const ROWS: Row[] = ['p', 'm', 'e']
const ROW_LABEL: Record<Row, [string, string]> = {
  p: ['People', 'Looking'],
  m: ['Together', 'In the room'],
  e: ['Spaces', 'Hosting'],
}
const COLOUR: Record<Row, string> = {
  p: 'var(--fq-x-aqua-neon)',
  m: 'var(--fq-x-magenta-neon)',
  e: 'var(--fq-x-sun-neon)',
}
const SVG_NS = 'http://www.w3.org/2000/svg'
const pad2 = (n: number) => String(n).padStart(2, '0')

function useKitSide(anchor: React.RefObject<HTMLElement | null>): Side {
  const [side, setSide] = useState<Side>('p')
  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-kit="site"]')
    if (!root) return
    const read = () => setSide(root.dataset.side === 'e' ? 'e' : 'p')
    read()
    const mo = new MutationObserver(read)
    mo.observe(root, { attributes: true, attributeFilter: ['data-side'] })
    return () => mo.disconnect()
  }, [anchor])
  return side
}

export function Weave({ stages }: { stages: WeaveStage[] }) {
  const wv = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const nodes = useRef<Record<Row, (HTMLButtonElement | null)[]>>({ p: [], m: [], e: [] })
  const side = useKitSide(wv)
  const [cur, setCur] = useState(0)
  const [mobile, setMobile] = useState(false)
  const [stageBoxes, setStageBoxes] = useState<{ left: number; width: number }[]>([])
  const [loopTops, setLoopTops] = useState<{ top: number; bot: number } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width:960px)')
    const on = () => setMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const draw = useCallback(() => {
    const host = wv.current
    const s = svg.current
    if (!host || !s) return
    const R = host.getBoundingClientRect()
    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height, cx: r.left - R.left + r.width / 2, cy: r.top - R.top + r.height / 2 }
    }
    s.replaceChildren()
    const add = (d: string, colour: string, cols: number[], lane: Row, cls: string[]) => {
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('stroke', colour)
      cls.forEach((c) => p.classList.add(c))
      p.dataset.cols = cols.join(',')
      p.dataset.lane = lane
      s.appendChild(p)
    }
    const link = (a: Element | null, b: Element | null, colour: string, cols: number[], flow: boolean, lane: Row) => {
      if (!a || !b) return
      const A = box(a)
      const B = box(b)
      let d: string
      if (Math.abs(A.cy - B.cy) > Math.abs(A.cx - B.cx) * 0.6) {
        const k = (B.cy - A.cy) / 2
        d = `M${A.cx} ${A.cy}C${A.cx} ${A.cy + k} ${B.cx} ${B.cy - k} ${B.cx} ${B.cy}`
      } else {
        const k = (B.cx - A.cx) / 2
        d = `M${A.cx} ${A.cy}C${A.cx + k} ${A.cy} ${B.cx - k} ${B.cy} ${B.cx} ${B.cy}`
      }
      add(d, colour, cols, lane, flow ? ['flow'] : [])
    }
    const n = nodes.current
    const last = stages.length - 1
    stages.forEach((_, c) => {
      link(n.p[c], n.m[c], COLOUR.p, [c], true, 'p')
      link(n.m[c], n.e[c], COLOUR.e, [c], true, 'e')
      if (c < last) {
        link(n.p[c], n.p[c + 1], COLOUR.p, [c, c + 1], false, 'p')
        link(n.e[c], n.e[c + 1], COLOUR.e, [c, c + 1], false, 'e')
        if (!mobile) {
          link(n.p[c], n.m[c + 1], COLOUR.m, [c, c + 1], false, 'p')
          link(n.e[c], n.m[c + 1], COLOUR.m, [c, c + 1], false, 'e')
        }
      }
    })
    if (!mobile && n.p[last] && n.e[last] && n.p[0] && n.e[0]) {
      const H = R.height
      const P4 = box(n.p[last])
      const E4 = box(n.e[last])
      const P0 = box(n.p[0])
      const E0 = box(n.e[0])
      add(`M${P4.cx} ${P4.y}V24H${P0.cx}V${P0.y}`, COLOUR.p, [last, 0], 'p', ['flow', 'loop'])
      add(`M${E4.cx} ${E4.y + E4.h}V${H - 24}H${E0.cx}V${E0.y + E0.h}`, COLOUR.e, [last, 0], 'e', ['flow', 'loop'])
      setStageBoxes(n.p.map((el) => (el ? { left: box(el).x, width: box(el).w } : { left: 0, width: 0 })))
      setLoopTops({ top: 24, bot: H - 24 })
    } else {
      setStageBoxes([])
      setLoopTops(null)
    }
  }, [mobile, stages])

  // Draw after layout, on resize (debounced), and once the web fonts settle the boxes.
  useEffect(() => {
    draw()
    let t: number | undefined
    const onResize = () => {
      window.clearTimeout(t)
      t = window.setTimeout(draw, 120)
    }
    window.addEventListener('resize', onResize)
    void document.fonts?.ready.then(draw)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(t)
    }
  }, [draw])

  // Light the threads through the current column, on the visitor's side.
  useEffect(() => {
    svg.current?.querySelectorAll<SVGPathElement>('path').forEach((p) => {
      const cols = (p.dataset.cols ?? '').split(',').map(Number)
      const loop = p.classList.contains('loop')
      const on = cols.includes(cur) && (p.dataset.lane === side || (cols.length === 1 && cols[0] === cur && !loop))
      p.classList.toggle('on', on)
    })
  }, [cur, side, stageBoxes])

  const w = stages[cur]
  const action = side === 'p' ? w.ap : w.ae
  const place = (r: number, c: number) =>
    mobile ? { gridRow: c + 2, gridColumn: r + 1 } : { gridRow: r + 1, gridColumn: c + 2 }

  return (
    <>
      <div className="weave" id="wv" ref={wv}>
        <svg className="wv-svg" ref={svg} aria-hidden="true" />
        {!mobile &&
          stageBoxes.map((b, c) => (
            <span key={c} className="wv-stage" style={{ left: b.left, width: b.width, top: -8 }}>
              {pad2(c + 1)} · {side === 'e' ? stages[c].se : stages[c].s}
            </span>
          ))}
        <span className="wv-loop top" style={loopTops ? { top: loopTops.top } : undefined}>
          ↺ Regulars host new Circles, and new people find them
        </span>
        <span
          className="wv-loop bot"
          style={loopTops ? { top: loopTops.bot, bottom: 'auto', transform: 'translate(-50%,-50%)' } : undefined}
        >
          ↺ The more you gather, the higher you rank on the calendar
        </span>
        <div className="wv-grid" onMouseOver={(e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('.wn')
          if (b) setCur(Number(b.dataset.c))
        }}>
          {ROWS.map((r, ri) => (
            <div key={r} className="wv-row" data-r={r} style={mobile ? { gridRow: 1, gridColumn: ri + 1 } : { gridRow: ri + 1, gridColumn: 1 }}>
              <b>{ROW_LABEL[r][0]}</b>
              {ROW_LABEL[r][1]}
            </div>
          ))}
          {stages.map((st, c) =>
            ROWS.map((r, ri) => (
              <button
                key={`${r}${c}`}
                type="button"
                className={c === cur ? 'wn hot' : 'wn'}
                data-r={r}
                data-c={c}
                data-set={r === 'm' ? undefined : r}
                style={place(ri, c)}
                ref={(el) => {
                  nodes.current[r][c] = el
                }}
                onFocus={() => setCur(c)}
                onClick={() => setCur(c)}
              >
                <FqIcon name={st[r][1]} />
                <span>{st[r][0]}</span>
              </button>
            )),
          )}
        </div>
      </div>
      <div className="wv-cap" aria-live="polite">
        <span className="k">
          {pad2(cur + 1)} · {side === 'e' ? w.se : w.s}
        </span>
        <p>{side === 'p' ? w.cp : w.ce}</p>
        <Link className="btn fq-iri-btn" href={action[1]}>
          {action[0]}
        </Link>
      </div>
    </>
  )
}
