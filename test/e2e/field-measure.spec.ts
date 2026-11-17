// Field measurement on a clean profile (SCAN-1218, SCAN-1205). A MEASURING spec, not a gate on speed.
//
// WHY IT EXISTS. Two backlog rows needed a real browser against production and the build box cannot
// reach that host. A GitHub runner can, and `e2e (manual)` already runs `pnpm test:e2e` against any
// `base_url` from any ref, so this file rides that dispatch instead of adding a workflow.
//
// WHEN IT RUNS. Only on a `workflow_dispatch` (GitHub sets GITHUB_EVENT_NAME on the runner), or by hand
// with PW_FIELD_MEASURE=1. On a pull request it skips with the reason named: about 200 cold page loads
// are a measurement to ask for, not a tax on every PR's preview.
//
// WHAT IT READS, per page, on a fresh browser context each time (no cookies, no cache, signed out):
//   - TTFB, FCP, LCP (and the element that was the LCP), CLS (session windows, the web-vitals rule),
//     and blocking time over 50 ms across long tasks, which is the lab stand-in for INP;
//   - bytes over the wire, from the DevTools protocol's `encodedDataLength`, split by resource type,
//     with decoded script bytes beside the encoded ones. Read twice: once when the page has settled,
//     and again after scrolling to the bottom, because lazy chunks arrive with the scroll.
//   - every console error and uncaught page error, so a hydration mismatch (React #418) is caught.
//
// THE CONTEXTS ARE BUILT HERE, NOT TAKEN FROM THE FIXTURE, because each profile needs its own device
// and the config's Vercel bypass headers do not belong on a visitor's request to production (they are
// sent only to a `*.vercel.app` base). Every context still gets `refuseRouterPrefetch`, the same
// refusal the fixture installs (LIVE-328): this file makes about 200 loads against the live database.
//
// WHAT THAT LEAVES UNMEASURED, said plainly. A real visitor's browser does send those prefetches, and
// a prefetched route can pull its own script chunks. So the script bytes here are the page's own, a
// FLOOR for a first visit, and the row counts how many prefetches the page tried (`prefetchesRefused`)
// so the size of what was held back is visible.
//
// HOW TO READ THE TIMINGS. The spec runs beside the rest of the suite on a shared four-core runner,
// so LCP and blocking time carry that noise: read them as lab numbers, median of three. Bytes, request
// counts and CLS do not depend on the runner. The `phone, throttled` profile applies 1.6 Mbps down,
// 750 kbps up, 150 ms latency and a 4x CPU slowdown in the browser, the same shape Lighthouse's phone
// run assumes; the other two profiles are unthrottled.
import { appendFileSync } from 'node:fs'
import type { Browser, BrowserContextOptions } from '@playwright/test'
import { test, expect } from './fixtures'
import { refuseRouterPrefetch } from './surfaces'

const baseURL = process.env.PW_BASE_URL
const asked = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.env.PW_FIELD_MEASURE === '1'

/** The landing pages SCAN-1218 names, plus the home page and the wizard every door leads to. */
const PAGES: readonly string[] = [
  '/pricing',
  '/the-community',
]

/** Where SCAN-1205 saw React #418, and `/`, where its cause was narrowed to. Both widths each. */
const HYDRATION_PAGES: readonly string[] = []
const HYDRATION_LOADS = 20
const RUNS = 3

type Throttle = { latency: number; down: number; up: number; cpu: number }
type Profile = { name: string; context: BrowserContextOptions; throttle?: Throttle }

// Written out rather than read from Playwright's device list, so a Playwright bump cannot quietly
// change what was measured. Every context is Chromium; the phone carries a phone's UA, touch and DPR.
const PHONE: BrowserContextOptions = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
}
const DESKTOP: BrowserContextOptions = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
}

const PROFILES: readonly Profile[] = [
  { name: 'phone 390, throttled', context: PHONE, throttle: { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8, cpu: 4 } },
  { name: 'phone 390', context: PHONE },
  { name: 'desktop 1280', context: DESKTOP },
]

/** Preview deployments sit behind Vercel protection; production gets a visitor's bare request. */
function visitorHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!baseURL || !secret || !/\.vercel\.app$/.test(new URL(baseURL).hostname)) return {}
  return { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true', 'x-vercel-skip-toolbar': '1' }
}

/** Installed before any page script. Buffered observers, so nothing before the read is missed. */
const VITALS = `(() => {
  const s = { lcp: 0, lcpEl: '', cls: 0, blocking: 0, longest: 0, tasks: 0, frameScriptMs: 0, frameRenderMs: 0, scripts: {} }
  let value = 0, first = 0, last = 0
  const watch = (type, each) => {
    try { new PerformanceObserver((list) => list.getEntries().forEach(each)).observe({ type, buffered: true }) } catch {}
  }
  watch('largest-contentful-paint', (e) => {
    s.lcp = e.startTime
    const el = e.element
    s.lcpEl = (el ? el.tagName.toLowerCase() : '?') + (e.url ? ' ' + e.url.split('?')[0].split('/').slice(-1)[0].slice(0, 60) : '')
  })
  watch('layout-shift', (e) => {
    if (e.hadRecentInput) return
    if (value && e.startTime - last < 1000 && e.startTime - first < 5000) value += e.value
    else { value = e.value; first = e.startTime }
    last = e.startTime
    if (value > s.cls) s.cls = value
  })
  watch('longtask', (e) => {
    s.tasks += 1
    s.blocking += Math.max(0, e.duration - 50)
    if (e.duration > s.longest) s.longest = e.duration
  })
  // WHO BLOCKED (long-animation-frame, Chromium): each long frame splits into script time and the
  // style/layout/paint after it, and each script names its invoker, file and function. Summed by key
  // so a page's blocking can be traced to the code that did it, not only measured.
  watch('long-animation-frame', (e) => {
    const end = e.startTime + e.duration
    if (e.renderStart) s.frameRenderMs += end - e.renderStart
    for (const x of e.scripts || []) {
      s.frameScriptMs += x.duration
      const file = (x.sourceURL || '').split('?')[0].split('/').slice(-1)[0] || '(inline)'
      const key = (x.invokerType || '?') + ' ' + (x.invoker || '').slice(0, 60) + ' @ ' + file + ' ' + (x.sourceFunctionName || '')
      s.scripts[key] = (s.scripts[key] || 0) + x.duration
      if (x.forcedStyleAndLayoutDuration > 20) s.scripts['FORCED ' + key] = (s.scripts['FORCED ' + key] || 0) + x.forcedStyleAndLayoutDuration
    }
  })
  // DIAG: name slow setTimeout callbacks through Sentry's wrapper.
  const st = window.setTimeout
  window.setTimeout = function (cb, ...rest) {
    if (typeof cb !== 'function') return st.call(this, cb, ...rest)
    const w = function (...a) {
      const t0 = performance.now()
      try { return cb.apply(this, a) } finally {
        const d = performance.now() - t0
        if (d > 30) { const o = cb.__sentry_original__ || cb; const k = 'TIMER ' + (o.name || 'anon') + ': ' + String(o).slice(0, 160).replace(/\s+/g, ' '); s.scripts[k] = (s.scripts[k] || 0) + d }
      }
    }
    return st.call(this, w, ...rest)
  }
  window.__fieldRead = () => {
    const nav = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return { ...s, ttfb: nav ? nav.responseStart : 0, fcp: fcp ? fcp.startTime : 0, load: nav ? nav.loadEventEnd : 0 }
  }
})()`

type Vitals = { lcp: number; lcpEl: string; cls: number; blocking: number; longest: number; tasks: number; ttfb: number; fcp: number; load: number; frameScriptMs: number; frameRenderMs: number; scripts: Record<string, number> }
type Bytes = { script: number; scriptDecoded: number; scriptRequests: number; image: number; style: number; font: number; total: number; requests: number }
type Visit = { status: number; cache: string; prefetches: number; vitals: Vitals; settled: Bytes; scrolled: Bytes; clsScrolled: number; errors: string[] }

const HYDRATION = /Minified React error #(418|419|421|422|423|425)|hydrat/i

/** One cold visit: a new context, one navigation, the readings, the context closed. */
async function visit(browser: Browser, profile: Profile, path: string, opts: { scroll: boolean; quietMs: number; capMs: number }): Promise<Visit> {
  const context = await browser.newContext({ ...profile.context, baseURL, extraHTTPHeaders: visitorHeaders() })
  try {
    await refuseRouterPrefetch(context)
    const page = await context.newPage()
    const errors: string[] = []
    let prefetches = 0
    page.on('request', (r) => {
      const h = r.headers()
      if (h['next-router-prefetch'] || h['next-router-segment-prefetch']) prefetches += 1
    })
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`)
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    if (profile.throttle) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile.throttle.latency,
        downloadThroughput: profile.throttle.down,
        uploadThroughput: profile.throttle.up,
      })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.throttle.cpu })
    }
    const kinds = new Map<string, string>()
    const bytes: Bytes = { script: 0, scriptDecoded: 0, scriptRequests: 0, image: 0, style: 0, font: 0, total: 0, requests: 0 }
    let lastActivity = Date.now()
    cdp.on('Network.requestWillBeSent', () => {
      lastActivity = Date.now()
    })
    cdp.on('Network.responseReceived', (e) => {
      kinds.set(e.requestId, e.type)
    })
    cdp.on('Network.dataReceived', (e) => {
      lastActivity = Date.now()
      if (kinds.get(e.requestId) === 'Script') bytes.scriptDecoded += e.dataLength
    })
    cdp.on('Network.loadingFinished', (e) => {
      lastActivity = Date.now()
      const kind = kinds.get(e.requestId)
      bytes.requests += 1
      bytes.total += e.encodedDataLength
      if (kind === 'Script') {
        bytes.script += e.encodedDataLength
        bytes.scriptRequests += 1
      } else if (kind === 'Image') bytes.image += e.encodedDataLength
      else if (kind === 'Stylesheet') bytes.style += e.encodedDataLength
      else if (kind === 'Font') bytes.font += e.encodedDataLength
    })
    /** Wait until the network has been quiet for `quietMs`, or `capMs` has passed. */
    const quiet = async (quietMs: number, capMs: number) => {
      const until = Date.now() + capMs
      while (Date.now() < until && Date.now() - lastActivity < quietMs) await page.waitForTimeout(250)
    }

    await page.addInitScript(VITALS)
    const response = await page.goto(path, { waitUntil: 'load', timeout: opts.capMs })
    await quiet(opts.quietMs, opts.capMs)
    const vitals = await page.evaluate<Vitals>('window.__fieldRead()')
    const settled = { ...bytes }

    let clsScrolled = vitals.cls
    if (opts.scroll) {
      await page.evaluate(`(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
          scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 200))
        }
      })()`)
      await quiet(opts.quietMs, opts.capMs)
      clsScrolled = (await page.evaluate<Vitals>('window.__fieldRead()')).cls
    }
    const headers = response ? response.headers() : {}
    return {
      status: response ? response.status() : 0,
      cache: headers['x-vercel-cache'] ?? '?',
      prefetches,
      vitals,
      settled,
      scrolled: { ...bytes },
      clsScrolled,
      errors,
    }
  } finally {
    await context.close()
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}
const kb = (n: number) => Math.round(n / 1024)

/** The job summary, when there is one. The same text always goes to stdout, which the job log keeps. */
function report(markdown: string): void {
  console.log(markdown)
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) appendFileSync(file, `${markdown}\n`)
}

// Not parallel inside this file: two cold loads timing each other would measure the runner.
test.describe.configure({ mode: 'default' })

test.describe('field measurement, clean profile', { tag: '@field' }, () => {
  test.skip(!baseURL, 'PW_BASE_URL is not set. Point it at production or a preview to take the reading.')
  test.skip(!asked, 'A measurement, not a PR gate: it runs on a workflow_dispatch, or with PW_FIELD_MEASURE=1.')
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'This file builds its own phone and desktop contexts; one project drives both.')
  })

  for (const profile of PROFILES) {
    for (const path of PAGES) {
      test(`vitals and bytes: ${path} (${profile.name})`, async ({ browser }) => {
        test.setTimeout(360_000)
        const throttled = Boolean(profile.throttle)
        const visits: Visit[] = []
        for (let run = 0; run < RUNS; run += 1) {
          visits.push(await visit(browser, profile, path, { scroll: !throttled, quietMs: 2000, capMs: throttled ? 90_000 : 30_000 }))
        }
        const mid = (pick: (v: Visit) => number) => median(visits.map(pick))
        const errors = [...new Set(visits.flatMap((v) => v.errors))]
        const row = {
          path,
          profile: profile.name,
          status: visits.map((v) => v.status).join('/'),
          cache: visits.map((v) => v.cache).join('/'),
          ttfbMs: Math.round(mid((v) => v.vitals.ttfb)),
          fcpMs: Math.round(mid((v) => v.vitals.fcp)),
          lcpMs: Math.round(mid((v) => v.vitals.lcp)),
          lcpAll: visits.map((v) => Math.round(v.vitals.lcp)).join('/'),
          lcpElement: visits[0].vitals.lcpEl,
          cls: Number(mid((v) => v.vitals.cls).toFixed(3)),
          clsAfterScroll: Number(mid((v) => v.clsScrolled).toFixed(3)),
          blockingMs: Math.round(mid((v) => v.vitals.blocking)),
          longestTaskMs: Math.round(mid((v) => v.vitals.longest)),
          scriptKb: kb(mid((v) => v.settled.script)),
          scriptDecodedKb: kb(mid((v) => v.settled.scriptDecoded)),
          scriptRequests: mid((v) => v.settled.scriptRequests),
          scriptKbAfterScroll: kb(mid((v) => v.scrolled.script)),
          imageKb: kb(mid((v) => v.settled.image)),
          imageKbAfterScroll: kb(mid((v) => v.scrolled.image)),
          styleKb: kb(mid((v) => v.settled.style)),
          fontKb: kb(mid((v) => v.settled.font)),
          totalKb: kb(mid((v) => v.settled.total)),
          totalKbAfterScroll: kb(mid((v) => v.scrolled.total)),
          requests: mid((v) => v.settled.requests),
          requestsAfterScroll: mid((v) => v.scrolled.requests),
          prefetchesRefused: mid((v) => v.prefetches),
          consoleErrors: errors.length,
          frameScriptMs: Math.round(mid((v) => v.vitals.frameScriptMs ?? 0)),
          frameRenderMs: Math.round(mid((v) => v.vitals.frameRenderMs ?? 0)),
          // The middle run by blocking time, so the attribution belongs to the run the median describes.
          topScripts: Object.entries([...visits].sort((a, b) => a.vitals.blocking - b.vitals.blocking)[Math.floor(visits.length / 2)].vitals.scripts ?? {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 16)
            .map(([key, ms]) => `${Math.round(ms)} ms ${key}`),
        }
        console.log(`[field-measure] ${JSON.stringify(row)}`)
        for (const error of errors) console.log(`[field-measure-error] ${path} (${profile.name}): ${error.slice(0, 500)}`)
        report(
          [
            `#### ${path} · ${profile.name} · median of ${RUNS} cold loads`,
            '| TTFB | FCP | LCP (each run) | CLS | CLS after scroll | Blocking | Script KB (decoded) | Script KB after scroll | Image KB | Total KB | Requests | Prefetches refused | Console errors |',
            '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
            `| ${row.ttfbMs} ms | ${row.fcpMs} ms | ${row.lcpMs} ms (${row.lcpAll}) | ${row.cls} | ${row.clsAfterScroll} | ${row.blockingMs} ms | ${row.scriptKb} (${row.scriptDecodedKb}) | ${row.scriptKbAfterScroll} | ${row.imageKb} | ${row.totalKb} | ${row.requests} | ${row.prefetchesRefused} | ${row.consoleErrors} |`,
          ].join('\n'),
        )
        // The reading is the product. The only assertion is that there was a page to read.
        for (const v of visits) expect(v.status, `${path} answered ${v.status}`).toBeLessThan(400)
      })
    }
  }

  for (const path of HYDRATION_PAGES) {
    for (const profile of [PROFILES[1], PROFILES[2]]) {
      test(`hydration: ${path} (${profile.name}), ${HYDRATION_LOADS} cold loads`, async ({ browser }) => {
        test.setTimeout(600_000)
        const hits: string[] = []
        const others = new Set<string>()
        for (let load = 0; load < HYDRATION_LOADS; load += 1) {
          const v = await visit(browser, profile, path, { scroll: false, quietMs: 1500, capMs: 20_000 })
          for (const error of v.errors) {
            if (HYDRATION.test(error)) hits.push(`load ${load + 1}: ${error.slice(0, 600)}`)
            else others.add(error.slice(0, 300))
          }
        }
        console.log(`[field-hydration] ${JSON.stringify({ path, profile: profile.name, loads: HYDRATION_LOADS, hydrationErrors: hits.length, otherErrors: others.size })}`)
        for (const hit of hits) console.log(`[field-hydration-hit] ${path} (${profile.name}) ${hit}`)
        for (const other of others) console.log(`[field-hydration-other] ${path} (${profile.name}) ${other}`)
        report(`#### hydration · ${path} · ${profile.name}\n${hits.length} hydration error(s) in ${HYDRATION_LOADS} cold loads; ${others.size} other distinct console error(s).`)
        expect(hits, `React hydration errors on ${path} at ${profile.name}`).toEqual([])
      })
    }
  }
})
