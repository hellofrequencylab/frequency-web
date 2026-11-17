'use client'

import { browserAllowsAnalytics, browserGoogleAllowed } from '@/lib/analytics/browser-policy'
import { cleanRef, type BriefEventName, type PrivatePage } from '@/lib/how/brief-events'

// Engagement tracking for the /how brief. Readers are mostly signed out, so this posts to
// /api/how/beacon (anonymous, consent-gated server-side too) rather than the member-tied sinks.
// No cookies: the session id is a random per-tab value in sessionStorage. Every event carries
// the recipient code from ?r= so each shared link reads as its own reader. A few milestones are
// mirrored to GA4 (pixel-safe: never the recipient code) when Google is allowed.
//
// Every private partner page runs this (PRIVATE_PAGES: /how, /facilities, /lab). Each batch names its
// page. Clicks are counted page-wide (header and footer too): every link, every button, and every form
// submit, by label and target. Never a typed value: a form submit records only the choice in its select.

const ENDPOINT = '/api/how/beacon'
const FLUSH_MS = 8000
const HEARTBEAT_S = 15
const DEPTHS = [25, 50, 75, 90, 100]

type Props = Record<string, string | number | boolean>

function randomId(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => (b % 36).toString(36)).join('')
}

function store(kind: 'session' | 'local') {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage } catch { return null }
}

export interface BriefTracker {
  calc: (calc: string, key: string, value: number, result: string) => void
  stop: () => void
}

export function startBriefTracker(root: HTMLElement, page: PrivatePage = '/how'): BriefTracker {
  const t0 = performance.now()
  const ss = store('session')
  const ls = store('local')

  // ── identity: per-tab session, recipient code, visit count ─────────────────
  let sid = ss?.getItem('how.sid') ?? ''
  if (!/^[a-z0-9]{8,32}$/.test(sid)) { sid = randomId(); ss?.setItem('how.sid', sid) }
  const url = new URL(window.location.href)
  const ref = cleanRef(url.searchParams.get('r')) ?? cleanRef(ss?.getItem('how.ref'))
  if (ref) ss?.setItem('how.ref', ref)

  let queue: { name: BriefEventName; props: Props; t: number }[] = []
  const emit = (name: BriefEventName, props: Props = {}) => {
    if (!browserAllowsAnalytics()) return
    queue.push({ name, props, t: Date.now() })
    if (queue.length >= 30) flush()
  }
  const flush = () => {
    if (!queue.length) return
    const payload = JSON.stringify({ sid, ref, page, events: queue })
    queue = []
    try {
      const ok = navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: 'application/json' }))
      if (!ok) void fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
    } catch { /* tracking never throws into the page */ }
  }
  const ga = (name: string, params: Props = {}) => {
    try { if (browserGoogleAllowed()) window.gtag?.('event', name, params) } catch { /* ignore */ }
  }

  // ── engaged time: only while visible and recently active ───────────────────
  let engagedMs = 0
  let lastActive = Date.now()
  let lastTick = Date.now()
  const active = () => { lastActive = Date.now() }
  const tick = () => {
    const now = Date.now()
    if (document.visibilityState === 'visible' && now - lastActive < 30_000) engagedMs += now - lastTick
    lastTick = now
  }
  const engagedS = () => Math.round(engagedMs / 1000)
  let nextBeat = HEARTBEAT_S
  const clock = window.setInterval(() => {
    tick()
    if (engagedS() >= nextBeat) { emit('how.heartbeat', { engaged_s: engagedS() }); nextBeat += HEARTBEAT_S }
  }, 1000)
  const flusher = window.setInterval(flush, FLUSH_MS)
  const activity = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
  activity.forEach((e) => window.addEventListener(e, active, { passive: true }))

  // ── page view ──────────────────────────────────────────────────────────────
  const visits = Number(ls?.getItem('how.visits') ?? '0') + 1
  if (browserAllowsAnalytics()) ls?.setItem('how.visits', String(visits))
  const refHost = (() => { try { return document.referrer ? new URL(document.referrer).host : '' } catch { return '' } })()
  const vw = window.innerWidth
  emit('how.view', {
    referrer_host: refHost, vw, vh: window.innerHeight,
    device: vw < 760 ? 'mobile' : vw < 1100 ? 'tablet' : 'desktop',
    visit: visits, returning: visits > 1,
    utm_source: url.searchParams.get('utm_source') ?? '', utm_medium: url.searchParams.get('utm_medium') ?? '', utm_campaign: url.searchParams.get('utm_campaign') ?? '',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  })

  // ── sections: first view + dwell ───────────────────────────────────────────
  const sections = Array.from(root.querySelectorAll<HTMLElement>('section[id]'))
  const seenSections = new Set<string>()
  const enteredAt = new Map<string, number>()
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = (e.target as HTMLElement).id
      if (e.isIntersecting) {
        enteredAt.set(id, performance.now())
        if (!seenSections.has(id)) {
          seenSections.add(id)
          emit('how.section_view', { section: id, idx: sections.findIndex((s) => s.id === id), at_s: engagedS() })
          ga('how_section_view', { section: id })
          if (id === 'appendix' || root.querySelector('.rp-close') === e.target) complete()
        }
      } else if (enteredAt.has(id)) {
        const ms = Math.round(performance.now() - (enteredAt.get(id) ?? 0))
        enteredAt.delete(id)
        if (ms > 1500) emit('how.section_dwell', { section: id, ms })
      }
    }
  }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 })
  // A section counts as in view while it crosses the middle fifth of the screen, which works for
  // short sections and for tall ones that never reach a visibility percentage on a phone.
  sections.forEach((s) => io.observe(s))
  const close = root.querySelector<HTMLElement>('.rp-close')
  if (close) io.observe(close)

  let completed = false
  function complete() {
    if (completed) return
    completed = true
    emit('how.complete', { engaged_s: engagedS(), sections: seenSections.size })
    ga('how_complete', { engaged_s: engagedS() })
  }

  // ── scroll depth ───────────────────────────────────────────────────────────
  let maxPct = 0
  const hit = new Set<number>()
  const onScroll = () => {
    const doc = document.documentElement
    const pct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / Math.max(1, doc.scrollHeight)) * 100))
    if (pct > maxPct) maxPct = pct
    for (const d of DEPTHS) if (pct >= d && !hit.has(d)) { hit.add(d); emit('how.scroll_depth', { pct: d, at_s: engagedS() }); ga('how_scroll', { percent: d }) }
    // A page without the brief's closing section completes when the reader reaches the bottom.
    if (pct >= 100 && !root.querySelector('.rp-close')) complete()
  }
  window.addEventListener('scroll', onScroll, { passive: true })

  // ── clicks: every link and button on the page, header and footer included ─
  const label = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest('a, button, summary, [role="button"]')
    if (!el) return
    if (el.tagName === 'BUTTON' && (el as HTMLButtonElement).type === 'submit') return // counted as the form submit
    const kind = el.closest('.rp-rail') ? 'rail' : el.closest('.rp-nav') ? 'nav' : el.closest('.rp-next') ? 'next' : el.closest('.rp-point') ? 'summary' : el.closest('.rp-pill') ? 'decision'
      : el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : el.tagName === 'A' ? 'link' : el.tagName === 'SUMMARY' ? 'expand' : 'button'
    const href = el.getAttribute('href') ?? ''
    emit('how.link_click', { kind, target: href.slice(0, 80), label: label(el), section: el.closest('section[id]')?.id ?? '' })
  }
  // A form submit: which form and the choice in its select, never anything typed.
  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement
    if (form?.tagName !== 'FORM') return
    const choice = form.querySelector('select')?.value ?? ''
    emit('how.link_click', { kind: 'form', target: form.id || form.closest('section[id]')?.id || 'form', label: choice.slice(0, 60), section: form.closest('section[id]')?.id ?? '' })
    flush()
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('submit', onSubmit, true)
  const onToggle = (e: Event) => {
    const d = e.target as HTMLDetailsElement
    if (d.tagName === 'DETAILS' && d.open) emit('how.appendix_open', { item: ((d.querySelector('summary i') ?? d.querySelector('summary'))?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) })
  }
  root.addEventListener('toggle', onToggle, true)

  // ── copy: what people lift out of the brief ────────────────────────────────
  const onCopy = () => {
    const sel = window.getSelection()
    const node = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement
    emit('how.copy', { section: node?.closest('section[id]')?.id ?? 'top', chars: sel?.toString().length ?? 0 })
  }
  document.addEventListener('copy', onCopy)

  // ── calculators (debounced per slider) ─────────────────────────────────────
  const timers = new Map<string, number>()
  let calcTouches = 0
  const calc = (which: string, key: string, value: number, result: string) => {
    window.clearTimeout(timers.get(key))
    timers.set(key, window.setTimeout(() => {
      calcTouches += 1
      emit('how.calc_input', { calc: which, key, value, result })
      ga('how_calc', { calc: which, key })
    }, 900))
  }

  // ── exit: hidden tab or leaving ────────────────────────────────────────────
  const onHide = () => {
    if (document.visibilityState !== 'hidden') return
    tick()
    enteredAt.forEach((start, id) => { const ms = Math.round(performance.now() - start); if (ms > 1500) emit('how.section_dwell', { section: id, ms }) })
    enteredAt.forEach((_, id) => enteredAt.set(id, performance.now()))
    emit('how.exit', { engaged_s: engagedS(), max_pct: maxPct, sections: seenSections.size, calc_touches: calcTouches, total_s: Math.round((performance.now() - t0) / 1000) })
    flush()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)

  return {
    calc,
    stop() {
      onHide()
      window.clearInterval(clock); window.clearInterval(flusher)
      activity.forEach((e) => window.removeEventListener(e, active))
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick, true); document.removeEventListener('submit', onSubmit, true); root.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide)
      io.disconnect(); timers.forEach((id) => window.clearTimeout(id))
      flush()
    },
  }
}
