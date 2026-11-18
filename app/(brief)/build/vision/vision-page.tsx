'use client'

import { Component, type MouseEvent, type ReactNode } from 'react'
import { BANDS, V963, type VisionBand } from './vision-data'
import { VisionMarkup } from './vision-markup'
import './vision.css'

// /build/vision: the Encinitas vision. The markup (vision-markup.tsx), data (vision-data.ts) and styles
// (vision.css) are generated from the design canvas; this file is the canvas's own logic, ported from its
// script: hash routes (#/852 opens a chapter, #/852/2 a section, #hz-852 a band of the index), the
// chapter mega menu, the header that tightens on scroll, and the marker that rides the frequency line.
// The canvas's invite gate (#/gate, a wireframe mock that let any code through) is not ported: the page
// is link-only, and #/gate opens the index.

const CH: VisionBand[] = [V963, ...BANDS]
const SHORT: Record<number, string> = { 963: 'Vision', 852: 'Community', 741: 'Platform', 639: 'Belonging', 528: 'Facilities', 417: 'Business', 396: 'Structure' }
const HZS = CH.map((c) => c.hz)
const colorOf = (c: VisionBand) => c.color

function rng(seed: number) {
  let s0 = seed
  return () => {
    s0 = (s0 * 16807) % 2147483647
    return s0 / 2147483647
  }
}

function sineD(hz: number, base: number, amp: number, seed: number, y0?: number) {
  const r = rng(seed)
  const hw0 = (base * 963) / hz
  const y = y0 ?? 30
  let x = -hw0 * (0.2 + r() * 0.6)
  let s = 1
  let d = 'M' + x.toFixed(1) + ' ' + y
  while (x < 1000) {
    const h = hw0 * (1 + (r() - 0.5) * 0.06)
    const k = (amp * (1 + (r() - 0.5) * 0.1) * 4) / 3
    d += ' C' + (x + 0.3642 * h).toFixed(1) + ' ' + (y - s * k).toFixed(1) + ' ' + (x + 0.6358 * h).toFixed(1) + ' ' + (y - s * k).toFixed(1) + ' ' + (x + h).toFixed(1) + ' ' + y
    x += h
    s = -s
  }
  return d
}

function hzAt(x: number) {
  const p = (x / 1000) * 7 - 0.5
  if (p <= 0) return HZS[0]
  if (p >= 6) return HZS[6]
  const k = Math.floor(p)
  return HZS[k] + (HZS[k + 1] - HZS[k]) * (p - k)
}

interface Seg { x0: number; h: number; s: number; a: number; ch: number }
const SEGS: Seg[] = (() => {
  const r = rng(77)
  const out: Seg[] = []
  let x = 0
  let s = 1
  while (x < 1000) {
    const h = ((11 * 963) / hzAt(x)) * (1 + (r() - 0.5) * 0.06)
    const a = 3.4 * (1 + (r() - 0.5) * 0.1)
    out.push({ x0: x, h, s, a, ch: 0 })
    x += h
    s = -s
  }
  for (const g of out) g.ch = Math.min(6, Math.floor(((g.x0 + g.h / 2) / 1000) * 7))
  return out
})()

function navSegs(hot: number) {
  return CH.map((_, k) => {
    const gs = SEGS.filter((g) => g.ch === k)
    return {
      w: k === hot ? '2.8' : '2',
      d: 'M' + gs[0].x0.toFixed(1) + ' 6' + gs.map((g) => {
        const q = (g.a * 4) / 3
        return ' C' + (g.x0 + 0.3642 * g.h).toFixed(1) + ' ' + (6 - g.s * q).toFixed(1) + ' ' + (g.x0 + 0.6358 * g.h).toFixed(1) + ' ' + (6 - g.s * q).toFixed(1) + ' ' + (g.x0 + g.h).toFixed(1) + ' 6'
      }).join(''),
    }
  })
}

function yAt(x: number) {
  const g = SEGS.find((s) => x >= s.x0 && x < s.x0 + s.h) ?? SEGS[SEGS.length - 1]
  return 6 - g.s * g.a * Math.sin((Math.PI * (x - g.x0)) / g.h)
}
const yPx = (x: number) => 4 + yAt(x)
const MINI_D = CH.map((c, k) => sineD(c.hz, 28.6, 12, 7 + k))
const nodeX = (k: number) => ((k + 0.5) / 7) * 1000
const tint = (c: string) => 'color-mix(in oklab,' + c + ' 13%,transparent)'
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

interface State { route: string; sub: string | null; compact: boolean; active: number; mega: number | null; w: number; wide: boolean; roomy: boolean }

export class VisionPage extends Component<Record<string, never>, State> {
  // Server render and first client render agree (a 1200px desktop at the top of the index); the real
  // width and the hash are read on mount, as the canvas did.
  state: State = { route: 'index', sub: null, compact: false, active: 0, mega: null, w: 1200, wide: true, roomy: true }
  mx = 0
  hot = -1
  lastY: number | null = null
  raf: number | null = null
  mt: ReturnType<typeof setTimeout> | undefined
  ht: ReturnType<typeof setTimeout> | undefined
  markEl: HTMLElement | null = null
  clipEl: SVGRectElement | null = null

  onResize = () => {
    const w = window.innerWidth
    this.setState({ w, wide: w >= 760, roomy: w >= 1100 })
    this.updateMarker()
  }
  onScroll = () => {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = null
      this.updateMarker()
    })
  }
  onHash = () => this.parse(false)
  onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.setState({ mega: null })
  }

  componentDidMount() {
    window.addEventListener('resize', this.onResize)
    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('hashchange', this.onHash)
    window.addEventListener('popstate', this.onHash)
    window.addEventListener('keydown', this.onKey)
    this.onResize()
    this.parse(true)
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('hashchange', this.onHash)
    window.removeEventListener('popstate', this.onHash)
    window.removeEventListener('keydown', this.onKey)
    clearTimeout(this.mt)
    clearTimeout(this.ht)
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  parse(first: boolean) {
    const h = location.hash
    let route = 'index'
    let sub: string | null = null
    if (h.startsWith('#/')) {
      const [a, b] = h.slice(2).split('/')
      if (BANDS.some((x) => x.key === a)) {
        route = a
        sub = b || null
      }
    }
    const changed = route !== this.state.route
    this.setState({ route, sub, mega: null }, () => requestAnimationFrame(() => {
      let el: HTMLElement | null = null
      if (route === 'index' && h.startsWith('#hz-')) el = document.getElementById(h.slice(1))
      if (route !== 'index' && sub) el = document.getElementById(route + '-' + sub)
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: changed || first ? 'auto' : 'smooth' })
      else if (changed && !(route === 'index' && h === '#top' && first)) window.scrollTo(0, 0)
      this.updateMarker()
    }))
  }

  updateMarker() {
    const vh = window.innerHeight
    const r = this.state.route
    let x = 0
    let act = 0
    const sy = window.scrollY
    const ly = this.lastY ?? sy
    let cp = this.state.compact
    if (sy < 60) cp = false
    else if (sy > ly + 4) cp = true
    else if (sy < ly - 4) cp = false
    if (Math.abs(sy - ly) > 4 || sy < 60) this.lastY = sy
    if (cp !== this.state.compact) this.setState({ compact: cp })
    if (r === 'index') {
      const probe = Math.max(160, vh * 0.3)
      const els = Array.from(document.querySelectorAll<HTMLElement>('.vx-root [data-band]'))
      els.forEach((el, k) => {
        const b = el.getBoundingClientRect()
        if (b.top <= probe) {
          x = ((k + Math.min(1, (probe - b.top) / b.height)) / 7) * 1000
          act = parseInt(el.getAttribute('data-band') ?? '0', 10)
        }
      })
      const last = els[els.length - 1]
      if (last && last.getBoundingClientRect().bottom < probe) act = 0
    } else {
      const k = CH.findIndex((c) => c.key === r)
      const max = Math.max(1, document.documentElement.scrollHeight - vh)
      x = ((k + Math.min(1, window.scrollY / max)) / 7) * 1000
    }
    this.mx = Math.max(2, Math.min(998, x))
    if (this.markEl) {
      this.markEl.style.left = this.mx / 10 + '%'
      this.markEl.style.top = yPx(this.mx) + 'px'
      this.markEl.style.boxShadow = '0 0 0 3px ' + this.markColor() + ',0 0 14px 4px ' + this.markColor()
    }
    if (this.clipEl) this.clipEl.setAttribute('width', String(this.mx + 20))
    if (r === 'index' && act !== this.state.active) this.setState({ active: act })
  }

  markColor() {
    return colorOf(CH[Math.min(6, Math.floor((this.mx / 1000) * 7))])
  }

  jump(n: number) {
    const el = document.querySelector('.vx-root [data-band="' + n + '"]')
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' })
  }

  openMega(k?: number) {
    clearTimeout(this.mt)
    clearTimeout(this.ht)
    if (k === undefined) return
    if (this.state.mega != null) {
      if (this.state.mega !== k) this.setState({ mega: k })
      return
    }
    this.ht = setTimeout(() => this.setState({ mega: k }), 140)
  }

  megaFor(k: number) {
    const c = CH[k]
    const col = colorOf(c)
    if (k === 0) {
      return {
        hz: 963, color: col, ink: c.ink, tint: tint(col), barD: sineD(963, 10, 3, 5, 6), kicker: 'Chapter 1 · The index', title: c.title, lede: c.lede,
        openLabel: 'Start at the top', openHref: '#hz-963', bandLabel: 'Open chapter 2 →', bandHref: '#/' + BANDS[0].key,
        items: BANDS.map((b, i) => ({ num: String(i + 2).padStart(2, '0'), title: b.band, sub: b.title, href: '#/' + b.key, ink: b.ink })),
      }
    }
    return {
      hz: c.hz, color: col, ink: c.ink, tint: tint(col), barD: sineD(c.hz, 10, 3, 5, 6), kicker: 'Chapter ' + (k + 1) + ' · ' + c.band, title: c.title, lede: c.lede,
      openLabel: 'Open chapter →', openHref: '#/' + c.key, bandLabel: 'Read it in the Vision ↑', bandHref: '#' + c.anchor,
      items: c.sections.map((s, i) => ({ num: String(i + 1).padStart(2, '0'), title: s.title, sub: clip(s.body, 74), href: '#/' + c.key + '/' + (i + 1), ink: c.ink })),
    }
  }

  vals() {
    const { active: a, route: r, w, roomy, mega, compact, wide } = this.state
    const isChapter = r !== 'index'
    const ck = isChapter ? CH.findIndex((c) => c.key === r) : a ? 7 - a : -1
    this.hot = ck
    const mOpen = mega != null
    const v: Record<string, unknown> = {
      isIndex: r === 'index', isChapter,
      activeHz: HZS[ck] || 963,
      gaugeDisplay: wide ? 'flex' : 'none',
      railPos: roomy ? 'sticky' : 'static', railFlex: roomy ? '0 1 150px' : '1 1 100%', railMax: roomy ? '150px' : '760px',
      railDir: roomy ? 'column' : 'row', railAlign: roomy ? 'stretch' : 'center', railWave: roomy ? 'block' : 'none', railToc: roomy ? 'flex' : 'none',
      toTop: (e: MouseEvent) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) },
      goHome: (e: MouseEvent) => {
        e.preventDefault()
        history.pushState(null, '', location.pathname + location.search)
        if (r === 'index') window.scrollTo({ top: 0, behavior: 'smooth' })
        else this.parse(false)
      },
      cityDisplay: w < 640 ? 'none' : 'inline',
      rowH: compact ? '42px' : '54px', titleSize: compact ? '14px' : '17px', citySize: compact ? '12px' : '14px', megaTop: compact ? '120px' : '132px',
      talkDisplay: w < 720 ? 'none' : 'inline', btnBg: mOpen ? 'var(--surface-card)' : 'transparent', caret: mOpen ? 'rotate(180deg)' : 'none', megaExpanded: mOpen ? 'true' : 'false',
      megaHover: () => this.openMega(),
      megaToggle: () => { clearTimeout(this.ht); clearTimeout(this.mt); this.setState((s) => ({ mega: s.mega != null ? null : 1 })) },
      crumbTitle: w < 900 ? 'none' : 'inline',
      navSegs: navSegs(ck), markX: String(this.mx + 20), markLeft: this.mx / 10 + '%', markTop: yPx(this.mx) + 'px',
      markColor: this.markColor(),
      markRef: (el: HTMLElement | null) => { this.markEl = el },
      clipRef: (el: SVGRectElement | null) => { this.clipEl = el },
      navNodes: CH.map((c, k) => {
        const cur = k === ck
        const open = mega === k
        return {
          hz: c.hz, short: SHORT[c.hz], color: colorOf(c), ink: c.ink, left: nodeX(k) / 10 + '%', weight: cur || open ? 800 : 600,
          bg: open || cur ? 'var(--surface-card)' : 'color-mix(in oklab,var(--bg-canvas) 97%,transparent)', caret: open ? 'rotate(180deg)' : 'none',
          op: cur || open ? 1 : 0.72, nameDisplay: w >= 900 ? 'inline' : 'none', aria: cur ? 'page' : 'false',
          expanded: open ? 'true' : 'false', line: cur ? colorOf(c) : 'transparent',
          drop: cur ? '0px' : '-22px', divider: k === 0 ? 'none' : '1px solid var(--border-hair)',
          radius: cur ? '0 0 14px 14px' : k === 0 ? '0 0 0 14px' : k === 6 ? '0 0 14px 0' : '0',
          // token-ok: the canvas's own tab shadows (generated design, docs/HOW-BRIEF.md)
          shadow: cur || open ? '0 10px 22px -12px rgb(0 0 0 / .45)' : '0 6px 14px -10px rgb(0 0 0 / .3)',
          enter: () => this.openMega(k),
          toggle: () => { clearTimeout(this.mt); clearTimeout(this.ht); this.setState((s) => ({ mega: s.mega === k ? null : k })) },
        }
      }),
      megaCols: CH.map((c, k) => ({ hz: c.hz, band: c.band, ink: c.ink, color: colorOf(c), d: MINI_D[k], sub: k === 0 ? 'The whole story on one page.' : c.title })),
      megaOpen: mOpen, mega: mOpen ? this.megaFor(mega) : { items: [] },
      megaEnter: () => clearTimeout(this.mt),
      megaLeave: () => { clearTimeout(this.ht); clearTimeout(this.mt); this.mt = setTimeout(() => this.setState({ mega: null }), 280) },
      megaClose: () => this.setState({ mega: null }),
    }
    for (let n = 1; n <= 7; n++) {
      v['op' + n] = a === n ? 1 : 0.5
      v['amp' + n] = a === n ? '22px' : '8px'
      v['jump' + n] = () => this.jump(n)
    }
    if (isChapter) {
      const b = CH[ck]
      const col = colorOf(b)
      const nx = CH[ck + 1]
      const pv = CH[ck - 1]
      v.p = {
        ...b, color: col, tint: tint(col), chapter: ck + 1, label: b.hz + ' Hz · ' + b.band, heroLabel: b.hz + ' Hz · hero', heroPh: (b.sections[0].ph || b.band).split('·')[0].trim(),
        d: sineD(b.hz, 18.2, 9, 3), barD: sineD(b.hz, 10, 3, 5, 6), heroD1: sineD(b.hz, 60, 11, 9, 200), heroD2: sineD(b.hz, 60, 11, 13, 250), bandHref: '#' + b.anchor,
        sections: b.sections.map((s, i) => ({ ...s, id: b.key + '-' + (i + 1), href: '#/' + b.key + '/' + (i + 1), num: String(i + 1).padStart(2, '0'), ph: s.ph || '', tbd: s.tbd || [], hasTbd: !!(s.tbd && s.tbd.length) })),
      }
      v.hasNext = !!nx
      v.next = nx ? { chapter: ck + 2, hz: nx.hz, title: nx.title, ink: nx.ink, color: colorOf(nx), tint: tint(colorOf(nx)), d: sineD(nx.hz, 18.2, 9, 21), sections: nx.sections.map((s) => s.title), href: '#/' + nx.key } : {}
      v.prev = { hz: pv.hz, title: pv.band, ink: pv.ink, href: ck - 1 === 0 ? '#hz-963' : '#/' + pv.key }
    } else {
      v.p = { sections: [] }
      v.hasNext = false
      v.next = { sections: [] }
      v.prev = {}
    }
    return v
  }

  render(): ReactNode {
    return (
      <main className="vx-root">
        <VisionMarkup v={this.vals()} />
      </main>
    )
  }
}
