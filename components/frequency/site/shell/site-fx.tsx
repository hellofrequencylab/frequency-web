'use client'

// THE FX LAYER of the Frequency public site: templates/website/web/fx.js (mood + texture) and the
// motion half of side.js (pop-in reveals, [data-px] parallax, the .phero hero, the .dock), as ONE
// client island. It renders nothing; after mount it decorates the page the kit CSS already styles
// (app/themes/frequency/kit-site.css, the fx.css section) and removes every trace on unmount, so a
// client navigation re-runs it on the new page.
//
//   hero sphere   .hero / .phero / .hp-hero get one signature sphere, a halo and a few jewels
//   halos, jewels section edges (.chap .sec .lv .closer), Features halves, the Join panel, Home's fold
//   seams         a gradient line on borderless .sec sections
//   grain         one generated 180px bitmap tile (--fq-fx-noise), a fixed film, and a tile on photos
//   signal lines  .lv-live / .fqm-live / .locpill, about 30fps, only while visible and the tab is shown
//   card light    a pointer-following spot on cards (fine pointers only)
//
// PERFORMANCE (README budget): one rAF-batched scroll loop that reads everything and then writes;
// orb fields pause offscreen ([data-off]); no SVG filters. Under prefers-reduced-motion nothing loops:
// no scroll motion, no signal lines, no card light, and reveals are shown at once (the CSS stops the
// keyframes). The page's energy, hues and quiet level come from the kit root's attributes
// (lib/frequency/site-pages.ts), so this file imports nothing but React and usePathname.

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

type Energy = 'still' | 'flow' | 'charge'

const H = {
  v: 'var(--fq-x-violet-neon)',
  m: 'var(--fq-x-magenta-neon)',
  a: 'var(--fq-x-aqua-neon)',
  s: 'var(--fq-x-sun-neon)',
}
// The page's three mood hues, as the kit root carries them.
const P = ['var(--fq-m1)', 'var(--fq-m2)', 'var(--fq-m3)']
const SIG: Record<Energy, { a: number; s: number; f: number }> = {
  still: { a: 0.35, s: 0.6, f: 1.4 },
  flow: { a: 0.6, s: 1.2, f: 2.2 },
  charge: { a: 1, s: 3.2, f: 3.4 },
}
const NS = 'http://www.w3.org/2000/svg'

let noise: string | null = null
function noiseTile(): string | null {
  if (noise) return noise
  try {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 180
    const cx = cv.getContext('2d')!
    const im = cx.createImageData(180, 180)
    // A fixed-seed generator, not Math.random: grain needs no entropy, and a tile that differs on
    // every load makes two honest captures of the same page differ across its whole surface.
    let s = 0x9e3779b9
    for (let q = 0; q < im.data.length; q += 4) {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      const v = (s >>> 0) % 256
      im.data[q] = im.data[q + 1] = im.data[q + 2] = v
      im.data[q + 3] = 255
    }
    cx.putImageData(im, 0, 0)
    noise = `url(${cv.toDataURL()})`
  } catch {
    noise = null
  }
  return noise
}

function run(root: HTMLElement): () => void {
  const d = document
  const RM = matchMedia('(prefers-reduced-motion:reduce)').matches
  const E = (root.dataset.energyPage as Energy) || 'flow'
  const quiet = Number(root.dataset.fxQuiet || 0)
  const added: Element[] = []
  const classed: [Element, string][] = []
  const offs: (() => void)[] = []
  const fields: HTMLElement[] = []
  let raf = 0

  const listen = (t: EventTarget, ev: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, opts)
    offs.push(() => t.removeEventListener(ev, fn, opts))
  }
  const addClass = (el: Element, c: string) => {
    if (!el.classList.contains(c)) {
      el.classList.add(c)
      classed.push([el, c])
    }
  }
  const mk = (tag: string, cls: string, parent: Element, before?: Node | null) => {
    const e = d.createElement(tag)
    e.className = cls
    e.setAttribute('aria-hidden', 'true')
    parent.insertBefore(e, before === undefined ? null : before)
    added.push(e)
    return e
  }

  // The shared noise tile. (fx.js also painted <html> with the canvas; site-shell.css does that in CSS.)
  const tile = noiseTile()
  if (tile) {
    root.style.setProperty('--fq-fx-noise', tile)
    root.setAttribute('data-fx', '')
  }

  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280)

  function field(host: HTMLElement): HTMLElement | null {
    if (host.querySelector(':scope>.tx-field')) return null
    const w = host.querySelector(':scope>.wrap')
    const f = mk('div', 'tx-field', host, w ?? host.firstChild)
    if (!w) {
      f.classList.add('under')
      addClass(host, 'tx-host')
      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative'
        offs.push(() => (host.style.position = ''))
      }
    }
    fields.push(f)
    return f
  }
  function orb(f: Element, cls: string, vars: Record<string, string | number>, inner?: string) {
    const e = d.createElement('span')
    e.className = cls
    for (const k in vars) e.style.setProperty(`--fq-${k}`, String(vars[k]))
    if (inner) e.innerHTML = inner
    f.appendChild(e)
    return e
  }
  const halo = (f: Element, c: string, s: string, x: string, y: string, o?: number | null, dl = 0) =>
    orb(f, 'tx-halo', { c, s, x, y, o: o == null ? '' : o, dl: `${dl}s` })
  function jewel(f: Element, c: string, px: number, x: string, y: string, keep?: boolean) {
    const e = orb(f, `tx-jewel${keep ? ' keep' : ''}`, { c, s: `${px}px`, x, y, dl: `${(-rnd() * 5).toFixed(2)}s` })
    e.dataset.depth = (0.04 + rnd() * 0.12).toFixed(2)
    return e
  }
  const sphere = (f: Element, c1: string, c2: string, s: string, x: string, y: string) =>
    orb(f, 'tx-sphere', { c1, c2, s, x, y }, '<i></i><b></b>')
  const jn = { still: 2, flow: 3, charge: 4 }[E]
  function jewels(f: Element, n: number, cols: string[]) {
    for (let i = 0; i < n; i++) {
      const left = rnd() < 0.5
      jewel(f, cols[i % cols.length], Math.round(6 + rnd() * 14), `${(left ? 2 + rnd() * 12 : 86 + rnd() * 12).toFixed(1)}%`, `${(8 + rnd() * 84).toFixed(1)}%`)
    }
  }
  // Website effects dress website markup only. A page that nests another kit (the public Space page's
  // members-kit body under the site header) keeps its own markup: these selectors (.panel, .block) are
  // that kit's class names too, and touching them before hydration is a hydration mismatch.
  const q = (sel: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((e) => !e.closest('[data-kit]:not([data-kit="site"])'))

  // Heroes: one signature sphere.
  q('.hero,.phero,.hp-hero').forEach((h) => {
    const f = field(h)
    if (!f) return
    halo(f, P[1], 'clamp(340px,42vw,640px)', '86%', '88%', 0.2)
    sphere(f, P[0], P[1], quiet === 2 ? 'clamp(160px,18vw,260px)' : 'clamp(100px,11vw,180px)', '86%', '88%')
    jewel(f, P[2], 14, '92%', '30%', true)
    jewel(f, P[0], 9, '74%', '70%')
    if (E !== 'still') {
      jewel(f, P[1], 20, '70%', '76%')
      jewel(f, P[2], 7, '58%', '58%')
    }
  })

  // Join: the sphere behind the form.
  const jp = root.querySelector<HTMLElement>('.jx-panel')
  const jf = jp && field(jp)
  if (jf) {
    halo(jf, P[0], '640px', '90%', '10%', 0.4)
    halo(jf, P[1], '520px', '10%', '95%', 0.3)
    sphere(jf, P[0], P[1], 'clamp(160px,18vw,280px)', '92%', '12%')
    jewels(jf, 3, P)
  }

  // Features halves keep their side colour.
  q('.half').forEach((h, i) => {
    const f = field(h)
    if (!f) return
    const e = h.classList.contains('half-e')
    const c = e ? H.s : H.a
    const c2 = e ? H.m : H.v
    halo(f, c, 'clamp(420px,55vw,820px)', i % 2 ? '12%' : '88%', '18%')
    halo(f, c2, 'clamp(320px,40vw,600px)', i % 2 ? '90%' : '10%', '80%', 0.25, -4)
    jewels(f, jn, [c, c2])
  })

  // Content sections: halos, jewels at the edges, a seam on borderless sections.
  if (quiet !== 2) {
    let i = 0
    q('.chap,.sec,.lv,.closer').forEach((s) => {
      if (s.id === 'story' || s.querySelector('.chap') || s.closest('.half')) return
      const f = field(s)
      if (!f) return
      const L = i % 2 === 0
      const isLv = s.classList.contains('lv')
      const c1 = isLv ? H.m : s.classList.contains('kg') || s.classList.contains('closer') ? P[1] : P[i % 3]
      const c2 = isLv ? H.a : P[(i + 1) % 3]
      halo(f, c1, 'clamp(380px,52vw,780px)', L ? '88%' : '12%', '34%', quiet ? 0.22 : null, -i * 1.7)
      if (!quiet) halo(f, c2, 'clamp(260px,34vw,520px)', L ? '8%' : '92%', '86%', 0.22, -i * 2.3)
      jewels(f, quiet ? 1 : jn, isLv ? [c1, c2, H.v] : [c1, c2, P[2]])
      if (s.classList.contains('sec') && !s.classList.contains('kg') && getComputedStyle(s).borderTopStyle === 'none') mk('span', 'tx-seam', s)
      i++
    })
  }

  // The closer: jewels ring the manifesto.
  const cl = root.querySelector('.closer>.tx-field')
  if (cl) {
    jewel(cl, P[0], 16, '22%', '30%', true)
    jewel(cl, P[2], 10, '78%', '26%', true)
    jewel(cl, P[1], 22, '84%', '70%')
    jewel(cl, P[0], 8, '16%', '74%')
  }

  // Home's photo scroll: halos behind, orbs drifting between the photos.
  const fs = root.querySelector<HTMLElement>('.fold-stage')
  const fold = root.querySelector<HTMLElement>('#fold')
  const fj: HTMLElement[] = []
  if (fs && fold && !fs.querySelector('.tx-field')) {
    const bk = mk('div', 'tx-field', fs, fs.firstChild)
    const fr = mk('div', 'tx-field', fs, fs.querySelector('.fl-shade')?.nextSibling ?? null)
    fields.push(bk, fr)
    halo(bk, P[0], 'clamp(420px,60vw,900px)', '20%', '30%', 0.4)
    halo(bk, P[1], 'clamp(380px,50vw,760px)', '82%', '70%', 0.35, -3)
    halo(bk, P[2], 'clamp(300px,36vw,560px)', '55%', '12%', 0.22, -6)
    halo(bk, P[1], 'clamp(400px,56vw,860px)', '50%', '-6%', 0.3, -2)
    const O: [Element, string, number, string, string, number][] = [
      [bk, P[1], 10, '18%', '14%', 0.5], [bk, P[2], 16, '78%', '18%', 1.1], [bk, P[0], 7, '40%', '40%', 0.8],
      [bk, P[2], 12, '92%', '80%', 1.4], [bk, P[1], 20, '6%', '86%', 1.9], [bk, P[0], 9, '58%', '30%', 0.6],
      [fr, P[0], 18, '30%', '26%', 1.6], [fr, P[1], 11, '70%', '34%', 0.9], [fr, P[2], 24, '26%', '72%', 2.1],
      [fr, P[0], 8, '62%', '82%', 1.2], [fr, P[1], 14, '86%', '52%', 1.8], [fr, P[2], 9, '10%', '48%', 0.7],
      [fr, P[0], 12, '48%', '62%', 2.4],
    ]
    O.forEach(([p, c, s, x, y, fd]) => {
      const e = orb(p, 'tx-jewel keep', { c, s: `${s}px`, x, y, dl: `${(-rnd() * 5).toFixed(2)}s` })
      e.dataset.fd = String(fd)
      fj.push(e)
    })
  }

  // Pause orb fields while offscreen.
  const fio = new IntersectionObserver(
    (es) => es.forEach((en) => (en.isIntersecting ? en.target.removeAttribute('data-off') : en.target.setAttribute('data-off', ''))),
    { rootMargin: '100px' },
  )
  fields.forEach((f) => fio.observe(f))
  offs.push(() => fio.disconnect())

  // Pop-in reveals (side.js): staggered 170ms, shown at once under reduced motion.
  let lastPop = 0
  const pio = new IntersectionObserver(
    (es) =>
      es.forEach((en) => {
        if (!en.isIntersecting) return
        const el = en.target
        const now = performance.now()
        const delay = Math.max(0, lastPop + 170 - now)
        lastPop = now + delay
        setTimeout(() => el.classList.add('in'), delay)
        pio.unobserve(el)
      }),
    { threshold: 0.2, rootMargin: '0px 0px -6% 0px' },
  )
  // THE CONTRACT: the kit holds every `.pop` at opacity 0 until it carries `.in`, so a `.pop` this
  // island never sees is a card nobody can see. The first pass only found the cards already in the DOM
  // at mount; a body that streams in after (a route with loading.tsx, a Suspense boundary, a client
  // list that renders later) stayed invisible. `pops()` runs again from the late-DOM observer below,
  // and a card the URL points at (#privacy on Help) is shown at once, as Help.html does.
  const seen = new WeakSet<Element>()
  const pops = () => {
    let target: Element | null = null
    try {
      if (location.hash.length > 1) target = d.getElementById(decodeURIComponent(location.hash.slice(1)))
    } catch {
      // A malformed hash names nothing.
    }
    q('.pop:not(.in)').forEach((el) => {
      if (seen.has(el)) return
      seen.add(el)
      if (RM || el === target) el.classList.add('in')
      else pio.observe(el)
    })
  }
  pops()
  offs.push(() => pio.disconnect())

  // ── One scroll loop: read everything, then write. ──
  const hero = root.querySelector<HTMLElement>('.hero')
  const hs = hero?.querySelector<HTMLElement>('.tx-sphere')
  const hh = hero?.querySelector<HTMLElement>('.tx-halo')
  const pj = q('.tx-jewel:not([data-fd])').map((j) => ({ el: j, p: j.parentElement!, k: -Number(j.dataset.depth || 0) }))
  const px = q('[data-px]')
  const ph = root.querySelector<HTMLElement>('.phero')
  const phb = ph?.querySelector<HTMLElement>('.bg')
  const phw = ph?.querySelector<HTMLElement>(':scope>.wrap')
  const dock = root.querySelector<HTMLElement>('.dock')
  const foot = root.querySelector<HTMLElement>('footer')
  const dockHero = root.querySelector<HTMLElement>('.phero,.hero')

  function frame() {
    raf = 0
    const vh = innerHeight
    const y = scrollY
    const w: (() => void)[] = []
    if (!RM) {
      if (hero && hs) {
        const k = Math.max(0, Math.min(1, y / (hero.offsetHeight * 0.75)))
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const dx = `${((90 - 5 * Math.sin(k * Math.PI * 2.4) + 2 * k - 86) / 100 * hero.offsetWidth).toFixed(1)}px`
        const dy = `${((38 + 52 * e - 88) / 100 * hero.offsetHeight).toFixed(1)}px`
        w.push(() => [hs, hh].forEach((n) => n && (n.style.setProperty('--fq-dx', dx), n.style.setProperty('--fq-dy', dy))))
      }
      if (fj.length && fold) {
        const r = fold.getBoundingClientRect()
        if (r.bottom > 0 && r.top < vh) {
          const p = Math.max(0, Math.min(1, -r.top / (r.height - vh)))
          const op = String(1 - Math.max(0, Math.min(1, (p - 0.55) / 0.2)) * 0.6)
          w.push(() => fj.forEach((e) => ((e.style.translate = `0 ${((0.1 - p) * Number(e.dataset.fd) * vh * 0.5).toFixed(1)}px`), (e.style.opacity = op))))
        }
      }
      const cache = new Map<Element, DOMRect>()
      pj.forEach((o) => {
        let r = cache.get(o.p)
        if (!r) cache.set(o.p, (r = o.p.getBoundingClientRect()))
        if (r.bottom < 0 || r.top > vh) return
        const t = `0 ${((r.top + r.height / 2 - vh / 2) * o.k).toFixed(1)}px`
        w.push(() => (o.el.style.translate = t))
      })
      px.forEach((el) => {
        const r = el.getBoundingClientRect()
        // `.rings.big` is centred by its own `translate: -50% 0` (Home's "Live this week"), so keep the x.
        const x = el.classList.contains('big') ? '-50%' : '0'
        const t = `${x} ${(((r.top + r.height / 2 - vh / 2) / vh) * -Number(el.dataset.px) * 100).toFixed(1)}px`
        w.push(() => (el.style.translate = t))
      })
      if (ph) {
        const py = Math.max(0, -ph.getBoundingClientRect().top)
        const k = Math.min(1, py / (ph.offsetHeight * 0.7))
        w.push(() => {
          if (phb) phb.style.transform = `scale(${1 + k * 0.12})`
          if (phw) {
            phw.style.opacity = String(1 - k * 0.9)
            phw.style.transform = `translate3d(0,${-py * 0.25}px,0)`
          }
        })
      }
    }
    if (dock && dockHero) {
      const on = dockHero.getBoundingClientRect().bottom < 80 && (!foot || foot.getBoundingClientRect().top > vh * 0.9)
      w.push(() => dock.classList.toggle('on', on))
    }
    w.forEach((f) => f())
  }
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  listen(window, 'scroll', onScroll, { passive: true })
  listen(window, 'resize', onScroll, { passive: true })
  frame()
  offs.push(() => {
    cancelAnimationFrame(raf)
    ;[...px, ...pj.map((o) => o.el), phb, phw].forEach((el) => el && ((el.style.translate = ''), (el.style.transform = ''), (el.style.opacity = '')))
  })

  // Grain: the fixed film, and a tile on photos.
  mk('div', 'tx-film', root)
  const grain = () =>
    q('.photo,.pd,.mm-card').forEach((n) => {
      if (!n.querySelector(':scope>.fq-grain')) mk('span', 'fq-grain', n)
    })

  // Signal lines: real activity only, ~30fps while visible.
  type Line = { p1: SVGPathElement; p2: SVGPathElement; e: { a: number; s: number; f: number }; ph: number; vis: boolean }
  const lines: Line[] = []
  let running = false
  let lastT = 0
  let sigRaf = 0
  const wave = (t: number, e: Line['e'], ph: number, k: number) => {
    let s = 'M'
    for (let i = 0; i <= 32; i++) {
      const x = i / 32
      const y = 12 + Math.sin(Math.PI * x) * e.a * 9 * (Math.sin(x * e.f * 6.283 + t * e.s * 2 + ph + k) * 0.65 + Math.sin(x * e.f * 13 + t * e.s * 3.1 + ph * 2 + k) * 0.35)
      s += `${i ? 'L' : ''}${(x * 100).toFixed(1)} ${y.toFixed(1)}`
    }
    return s
  }
  const draw = (l: Line, t: number) => {
    l.p1.setAttribute('d', wave(t, l.e, l.ph, 0))
    l.p2.setAttribute('d', wave(t * 0.8, l.e, l.ph, 1.7))
  }
  const loop = (now: number) => {
    const any = lines.some((l) => l.vis)
    if (now - lastT >= 33) {
      lastT = now
      lines.forEach((l) => l.vis && draw(l, now / 1000))
    }
    if (any && !d.hidden) sigRaf = requestAnimationFrame(loop)
    else running = false
  }
  const kick = () => {
    if (RM || running) return
    running = true
    sigRaf = requestAnimationFrame(loop)
  }
  const sio = new IntersectionObserver((es) => {
    es.forEach((en) => {
      const l = (en.target as SVGSVGElement & { __l?: Line }).__l
      if (l) l.vis = en.isIntersecting
    })
    kick()
  })
  offs.push(() => (sio.disconnect(), cancelAnimationFrame(sigRaf)))
  listen(d, 'visibilitychange', kick)
  function sig(host: Element, after?: Element | null) {
    if (host.querySelector('.tx-sig')) return
    const s = d.createElementNS(NS, 'svg') as SVGSVGElement & { __l?: Line }
    s.setAttribute('class', 'tx-sig')
    s.setAttribute('viewBox', '0 0 100 24')
    s.setAttribute('preserveAspectRatio', 'none')
    s.setAttribute('aria-hidden', 'true')
    const p1 = d.createElementNS(NS, 'path')
    const p2 = d.createElementNS(NS, 'path')
    s.append(p1, p2)
    host.insertBefore(s, after ? after.nextSibling : null)
    added.push(s)
    const z = host.closest<HTMLElement>('[data-energy]')
    const l: Line = { p1, p2, e: SIG[(z?.dataset.energy as Energy) || 'flow'] ?? SIG.flow, ph: rnd() * 10, vis: false }
    s.__l = l
    lines.push(l)
    sio.observe(s)
    draw(l, 0)
  }
  const sigs = () => {
    q('.lv-live,.fqm-live').forEach((h) => sig(h))
    const lp = root.querySelector('.locpill')
    if (lp) sig(lp, lp.querySelector('span'))
  }

  // Card light: a spot that follows a fine pointer.
  q('.fx,.half,.block,.door,.ledger>div,.panel,.stub,.next,.wv-cap').forEach((c) => {
    if (c.querySelector(':scope>.tx-spot')) return
    addClass(c, 'tx-lit')
    mk('span', 'tx-spot', c, c.firstChild)
  })
  if (!RM && matchMedia('(hover:hover)').matches) {
    let pe: PointerEvent | null = null
    let pq = false
    listen(
      d,
      'pointermove',
      ((e: PointerEvent) => {
        pe = e
        if (pq) return
        pq = true
        requestAnimationFrame(() => {
          pq = false
          const c = (pe?.target as Element | null)?.closest?.<HTMLElement>('.tx-lit')
          if (!c || !pe) return
          const r = c.getBoundingClientRect()
          c.style.setProperty('--fq-mx', `${pe.clientX - r.left}px`)
          c.style.setProperty('--fq-my', `${pe.clientY - r.top}px`)
        })
      }) as EventListener,
      { passive: true },
    )
  }

  // Late DOM (map popups, anything a page mounts after us): grain, signal lines and pop reveals,
  // debounced.
  const late = () => {
    grain()
    sigs()
    pops()
  }
  late()
  let mq: ReturnType<typeof setTimeout> | 0 = 0
  const mo = new MutationObserver(() => {
    if (!mq) mq = setTimeout(() => ((mq = 0), late()), 300)
  })
  mo.observe(root.querySelector('main') ?? root, { childList: true, subtree: true })
  offs.push(() => (mo.disconnect(), mq && clearTimeout(mq)))

  return () => {
    offs.forEach((f) => f())
    added.forEach((e) => e.remove())
    classed.forEach(([e, c]) => e.classList.remove(c))
    root.style.removeProperty('--fq-fx-noise')
    root.removeAttribute('data-fx')
  }
}

/** Mount once inside the kit root; it re-decorates on every page view. */
export function SiteFx() {
  const pathname = usePathname()
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-kit="site"]')
    if (!root) return
    return run(root)
  }, [pathname])
  return null
}
