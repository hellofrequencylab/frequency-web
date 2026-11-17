// Scroll-aware motion for the /how brief. Shared by the site page (how-brief.tsx) and, compiled to
// a classic script, by the design artifact's componentDidMount. No framework, no imports.

const SEEN_KEY = 'how.seen.v1'

/** Side rail: the section under the reader glows; sections they have reviewed stay lit. */
export function startRail(root: HTMLElement): () => void {
  root.classList.add('js-rail')
  const links = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('.rp-rail a[data-sec]').forEach((a) => links.set(a.dataset.sec ?? '', a))
  const fill = root.querySelector<HTMLElement>('.rp-rail .fill')
  let seen = new Set<string>()
  try { seen = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[]) } catch { /* private mode */ }
  const order = Array.from(links.keys())
  const sections = order.map((id) => root.querySelector<HTMLElement>(`#${id}`)).filter((s): s is HTMLElement => !!s)
  const paint = () => {
    links.forEach((a, id) => a.classList.toggle('is-seen', seen.has(id)))
    const last = order.reduce((acc, id, i) => (seen.has(id) ? i : acc), 0)
    if (fill) fill.style.transform = `scaleY(${order.length > 1 ? last / (order.length - 1) : 0})`
  }
  const pick = () => {
    const vh = window.innerHeight
    let current: string | null = null
    for (const s of sections) {
      const r = s.getBoundingClientRect()
      if (r.top <= vh * 0.45 && r.bottom > vh * 0.45) current = s.id
      // Reviewed = the reader has gone a good way into it, or right through it.
      if (r.top < vh * 0.4 && (r.bottom < vh || -r.top > Math.min(r.height * 0.35, vh)) && !seen.has(s.id)) {
        seen.add(s.id)
        try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen])) } catch { /* ignore */ }
      }
    }
    links.forEach((a, id) => {
      a.classList.toggle('is-current', id === current)
      if (id === current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current')
    })
    paint()
  }
  let raf = 0
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick() }) }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  pick()
  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    if (raf) cancelAnimationFrame(raf)
  }
}

/**
 * "Groups fade": while the reader scrolls the loop runs; when they stop on it, it slows, dims and
 * comes to rest, then spins back up and relights as soon as they scroll again. Drives the SVG's
 * own animation clock (SMIL) and the CSS animations inside it through one eased rate, 0..1.
 */
export function startIdleSpin(root: HTMLElement): () => void {
  const targets = Array.from(root.querySelectorAll<SVGSVGElement>('svg.rp-idle'))
  if (!targets.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const IDLE_MS = 900
  let lastScroll = performance.now()
  let rate = 1
  let last = performance.now()
  let raf = 0
  const visible = new Set<Element>()
  const clocks = new Map<SVGSVGElement, number>()
  targets.forEach((svg) => { svg.pauseAnimations(); clocks.set(svg, svg.getCurrentTime()) })
  const loop = (now: number) => {
    raf = 0
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    const moving = now - lastScroll < IDLE_MS
    // Spin up quickly (about 0.6s), wind down slowly (about 2.5s), so the stop feels like a fade.
    rate += ((moving ? 1 : 0) - rate) * (moving ? 1 - Math.exp(-dt / 0.2) : 1 - Math.exp(-dt / 0.85))
    if (rate < 0.002) rate = 0
    for (const svg of targets) {
      if (!visible.has(svg)) continue
      const t = (clocks.get(svg) ?? 0) + dt * rate
      clocks.set(svg, t)
      svg.setCurrentTime(t)
      svg.getAnimations({ subtree: true }).forEach((a) => { a.playbackRate = Math.max(rate, 0.0001) })
      // The artwork dims; the labels (svg <text>) stay readable, since people stop here to read.
      svg.style.setProperty('--idle', String(rate))
    }
    if (visible.size && (rate > 0 || moving)) raf = requestAnimationFrame(loop)
  }
  const kick = () => { if (!raf && visible.size) { last = performance.now(); raf = requestAnimationFrame(loop) } }
  const onScroll = () => { lastScroll = performance.now(); kick() }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target) }
    kick()
  })
  targets.forEach((svg) => io.observe(svg))
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    window.removeEventListener('scroll', onScroll)
    io.disconnect()
    if (raf) cancelAnimationFrame(raf)
    targets.forEach((svg) => svg.unpauseAnimations())
  }
}

/** Both behaviours, for the design artifact's componentDidMount. */
export function startBriefMotion(root: HTMLElement): () => void {
  const a = startRail(root)
  const b = startIdleSpin(root)
  return () => { a(); b() }
}
