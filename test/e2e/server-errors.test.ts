// THE CAPTURE REFUSES A DEGRADED DEPLOYMENT (LIVE-333, ADR-NNNN).
//
// 🔴 THE DEFECT, measured. The 2026-09-14 recapture (run 34909054841, against production)
// photographed 89 PNGs while the REST edge answered 503 to 11,042 requests between 23:33Z and
// 23:42Z. The run PASSED, the runner committed the PNGs, the PR merged as #2594, and the next
// three `pr-compare` runs failed 62 public comparisons at 1 to 2 percent on every page and every
// mode — because the baselines they were measured against depicted a shell whose data reads had
// failed. ADR-1328 wrote down that the capture fan-out causes the 5xx windows. Nothing wrote down
// that a capture taken inside one writes the window into the repository as the definition of
// correct.
//
// These tests drive the REAL recorder and the REAL refusal with scripted responses — no browser,
// no deployment. The point is not that a status is collected (a recorder that collects and never
// refuses proves nothing); it is that the capture REFUSES, and that the message carries the URL
// and the status so a run can be diagnosed from the CI log alone.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEGRADED_CAPTURE_LOG,
  TELEMETRY_5XX_IGNORED,
  assertNoServerErrors,
  createServerErrorLog,
  isIgnorable5xx,
  serverErrorFrom,
  serverErrorRefusal,
  watchServerErrors,
  type ObservedResponse,
  type ServerError,
  type ServerErrorLog,
} from './surfaces'
import type { BrowserContext } from '@playwright/test'

/** A scripted Playwright `Response`: exactly the three calls `serverErrorFrom` makes. */
function response(status: number, url: string, resourceType = 'fetch'): ObservedResponse {
  return {
    url: () => url,
    status: () => status,
    request: () => ({ resourceType: () => resourceType }),
  }
}

/**
 * A scripted `BrowserContext` for `watchServerErrors`: it captures the handler the recorder
 * installs and lets a test fire responses through it, which is what proves the WIRING rather
 * than the predicate. Only `on` is reached, so the rest of the interface is unimplemented.
 */
function fakeContext(): { context: BrowserContext; emit: (r: ObservedResponse) => void } {
  const handlers: ((r: ObservedResponse) => void)[] = []
  const context = {
    on(event: string, handler: (r: ObservedResponse) => void) {
      expect(event, 'the recorder must listen on the CONTEXT response event').toBe('response')
      handlers.push(handler)
      return context
    },
  } as unknown as BrowserContext
  return { context, emit: (r) => handlers.forEach((handler) => handler(r)) }
}

/** A log with the given responses already recorded through the real handler. */
function logAfter(...responses: ObservedResponse[]): ServerErrorLog {
  const log = createServerErrorLog()
  const { context, emit } = fakeContext()
  watchServerErrors(context, log)
  for (const r of responses) emit(r)
  return log
}

/** The injectable sink, so nothing in this file writes into the repository. */
function spySink(): { calls: { label: string; seen: readonly ServerError[] }[]; sink: (label: string, seen: readonly ServerError[]) => void } {
  const calls: { label: string; seen: readonly ServerError[] }[] = []
  return { calls, sink: (label, seen) => calls.push({ label, seen }) }
}

const PAGE = 'https://frequency-web-abc123.vercel.app'

describe('🔴 a scripted 503 during a capture REFUSES the surface', () => {
  it('throws, and the message carries the URL and the status', () => {
    // The row's own acceptance test: "A unit test drives the fixture with a scripted 503 response
    // and asserts the capture refuses." 503 specifically — the status the REST edge answered with
    // for nine minutes on 2026-09-14.
    const log = logAfter(response(503, `${PAGE}/feed?_rsc=1a2b3c`))
    const { sink } = spySink()
    let thrown: unknown
    try {
      assertNoServerErrors(log, '/feed [dawn-light · desktop]', sink)
    } catch (error) {
      thrown = error
    }
    expect(thrown, 'a capture that saw a 503 must FAIL, not photograph the page').toBeInstanceOf(Error)
    const message = (thrown as Error).message
    // A capture that fails with "a request failed" costs a whole run to diagnose, and the runs
    // this guard fires on are 45-minute runs against a deployment somebody has to go and look at.
    expect(message).toContain('503')
    expect(message).toContain(`${PAGE}/feed?_rsc=1a2b3c`)
    // And it names the surface, so a failure in a 160-test matrix says WHICH picture was refused.
    expect(message).toContain('/feed [dawn-light · desktop]')
    expect(message).toContain('REFUSING TO CAPTURE')
  })

  it('records the refusal for the RUN, which is what the commit step reads', () => {
    // Half (2) of the row. The `update-baselines` commit step is `if: always()` ON PURPOSE
    // (ADR-1273: one flaky surface must not discard the other captures), so a non-zero capture
    // does NOT stop it. The marker file is what tells a run-wide degradation from one flake.
    const log = logAfter(response(500, `${PAGE}/api/spaces`))
    const { calls, sink } = spySink()
    expect(() => assertNoServerErrors(log, '/spaces [midnight-light · mobile]', sink)).toThrow()
    expect(calls).toHaveLength(1)
    expect(calls[0].label).toBe('/spaces [midnight-light · mobile]')
    expect(calls[0].seen).toEqual([
      { url: `${PAGE}/api/spaces`, status: 500, resourceType: 'fetch' },
    ])
  })

  it('says so LOUDLY when its own marker could not be written', () => {
    // Every fail-safe needs a gate that notices it fired (AGENTS.md), and that rule applies to
    // this guard's own marker: a refusal whose marker silently failed to land would leave the
    // commit step believing the run was clean. The message must carry both facts.
    const log = logAfter(response(502, `${PAGE}/`))
    const failing = () => {
      throw new Error('EROFS: read-only file system')
    }
    let message = ''
    try {
      assertNoServerErrors(log, '/ [dawn-light · desktop]', failing)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('502')
    expect(message).toContain(DEGRADED_CAPTURE_LOG)
    expect(message).toContain('EROFS')
    expect(message).toContain('Do not commit the baselines this run produced.')
  })

  it('covers the page’s RSC FETCHES and its subresources, not just the navigation', () => {
    // The row's sharpest clause, and the reason a document-only check would not have helped: an
    // App Router page's data reads are SEPARATE requests, and the 2026-09-14 shell rendered. A
    // guard that only read the navigation response would have passed that capture.
    for (const [resourceType, url] of [
      ['document', `${PAGE}/the-lab`],
      ['fetch', `${PAGE}/the-lab?_rsc=deadbe`],
      ['image', `${PAGE}/_next/image?url=%2Fhero.jpg&w=1920&q=75`],
      ['font', `${PAGE}/_next/static/media/inter.woff2`],
      ['script', `${PAGE}/_next/static/chunks/main-app.js`],
      ['stylesheet', `${PAGE}/_next/static/css/app.css`],
    ] as const) {
      const log = logAfter(response(503, url, resourceType))
      expect(() => assertNoServerErrors(log, url, spySink().sink), `${resourceType} 5xx must refuse`).toThrow(
        /REFUSING TO CAPTURE/,
      )
      expect(serverErrorRefusal(log, url)).toContain(`(${resourceType})`)
    }
  })

  it('every 5xx status refuses, and nothing below 500 does', () => {
    for (const status of [500, 501, 502, 503, 504, 508, 521, 599]) {
      expect(serverErrorFrom(response(status, `${PAGE}/x`)), `${status} must be recorded`).not.toBeNull()
    }
    // The NEGATIVE CONTROL for the threshold. A 404 on a marketing page is a product fact the
    // pixels already show; a 401/403 is the protection wall, which `assertNotProtectionWall`
    // already fails on by name and with better advice. Only a SERVER error means "the thing we
    // photographed is not what the page is".
    for (const status of [200, 204, 301, 304, 307, 400, 401, 403, 404, 429, 499]) {
      expect(serverErrorFrom(response(status, `${PAGE}/x`)), `${status} must NOT be recorded`).toBeNull()
    }
  })
})

describe('the NEGATIVE CONTROL: a clean capture still passes', () => {
  it('a run with no 5xx refuses nothing and writes no marker', () => {
    // Without this the guard could be a wall that fails everything, which would read as a working
    // gate for exactly as long as nobody captured anything.
    const log = logAfter(
      response(200, `${PAGE}/feed`, 'document'),
      response(200, `${PAGE}/feed?_rsc=1a2b3c`),
      response(304, `${PAGE}/_next/static/chunks/main-app.js`, 'script'),
      response(404, `${PAGE}/favicon-missing.ico`, 'image'),
    )
    expect(log.seen).toEqual([])
    expect(serverErrorRefusal(log, '/feed')).toBeNull()
    const { calls, sink } = spySink()
    expect(() => assertNoServerErrors(log, '/feed', sink)).not.toThrow()
    expect(calls).toEqual([])
  })

  it('an IGNORABLE 5xx — a telemetry beacon — still passes', () => {
    // WHERE THE LINE IS. A gate that fails a capture because Google Analytics had a bad minute is
    // noise, and ADR-970 is explicit about what happens to a gate that fires dishonestly: it gets
    // routed around, and then it reads as coverage. Every entry is a beacon that renders nothing.
    for (const entry of TELEMETRY_5XX_IGNORED) {
      expect(entry.why.length, `${entry.match} must carry the reason it renders nothing`).toBeGreaterThan(20)
      // A `path` entry must look like a path and a `host` entry must not, or the two matchers
      // silently swap and the entry stops covering the thing it was added for.
      if (entry.kind === 'path') expect(entry.match.startsWith('/')).toBe(true)
      else expect(entry.match).not.toContain('/')
    }
    const log = logAfter(
      response(503, 'https://www.googletagmanager.com/gtag/js?id=G-XXXX', 'script'),
      response(500, 'https://region1.google-analytics.com/g/collect?v=2', 'fetch'),
      response(502, `${PAGE}/_vercel/insights/event`, 'fetch'),
      response(503, `${PAGE}/_vercel/speed-insights/vitals`, 'fetch'),
      response(500, 'https://o123.ingest.sentry.io/api/456/envelope/', 'fetch'),
    )
    expect(log.seen).toEqual([])
    expect(() => assertNoServerErrors(log, '/ [dawn-light · desktop]', spySink().sink)).not.toThrow()
  })

  it('but DEFAULT-DENY: a 5xx from anything not on the list refuses', () => {
    // The direction of the default is the whole judgement call, so it gets an assertion. A new
    // route handler, a new RSC segment, a new image transform — none of them have to be enumerated
    // anywhere for this guard to cover them, which is the opposite of the defect that filed the row.
    for (const url of [
      `${PAGE}/api/discover/list`,
      `${PAGE}/_next/image?url=%2Fx.jpg`,
      `${PAGE}/rest/v1/profiles`,
      'https://cdn.example.com/partner-widget.js',
      // 🔴 THE LOOK-ALIKE. A substring list ignores all three of these, and the first draft of
      // this guard did: `url.includes('googletagmanager.com')` is true for a host that merely
      // ENDS in something else, for a subdomain-shaped suffix, and for a query parameter. The
      // consequence of getting it wrong here is a silenced gate, not a noisy one.
      'https://googletagmanager.com.evil.test/x',
      'https://evil-googletagmanager.com/x',
      `${PAGE}/api/read?referrer=google-analytics.com`,
      // And the path kind: `/_vercel/insights/` is a PREFIX, not a substring anywhere in the URL.
      `${PAGE}/api/read?next=/_vercel/insights/event`,
      // An unparseable URL is not a beacon we recognise. Default-deny holds on malformed input.
      'not a url at all',
    ]) {
      expect(isIgnorable5xx(url), `${url} must not be ignorable`).toBe(false)
      expect(serverErrorFrom(response(503, url))).not.toBeNull()
    }
  })

  it('the beacon hosts match their own SUBDOMAINS, which is why they are hosts and not substrings', () => {
    // The regional GA and Sentry hosts are subdomains, so the host rule has to admit them — and
    // the assertion above proves it does not admit a look-alike in the same move.
    for (const url of [
      'https://region1.google-analytics.com/g/collect',
      'https://www.googletagmanager.com/gtag/js',
      'https://o123.ingest.sentry.io/api/456/envelope/',
      'https://o123.ingest.us.sentry.io/api/456/envelope/',
    ]) {
      expect(isIgnorable5xx(url), `${url} is a real beacon host`).toBe(true)
    }
  })

  it('the env reprieve quiets ONE substring for ONE run, and nothing else', () => {
    // Mirrors PW_VISUAL_EXTRA_MASK (see envMaskSelectors): quiet a URL the same week it flakes
    // without editing code, because a reprieve that leaves no diff also leaves no permanent hole.
    const before = process.env.PW_CAPTURE_ALLOW_5XX
    try {
      process.env.PW_CAPTURE_ALLOW_5XX = '/embed/, partner.example'
      expect(isIgnorable5xx(`${PAGE}/embed/player`)).toBe(true)
      expect(isIgnorable5xx('https://partner.example/widget.js')).toBe(true)
      expect(isIgnorable5xx(`${PAGE}/api/discover/list`)).toBe(false)
      process.env.PW_CAPTURE_ALLOW_5XX = ''
      expect(isIgnorable5xx(`${PAGE}/embed/player`), 'an empty value must quiet NOTHING').toBe(false)
    } finally {
      if (before === undefined) delete process.env.PW_CAPTURE_ALLOW_5XX
      else process.env.PW_CAPTURE_ALLOW_5XX = before
    }
  })
})

describe('the recorder survives what a real run throws at it', () => {
  it('a handler that cannot read a response loses the reading, never the run', () => {
    // Playwright disposes a request object after its page closes, so `request()` can throw inside
    // the event handler. A recorder that propagates that would take down the suite it exists to
    // report on — and it would do so from an event callback, several frames from anything readable.
    const log = createServerErrorLog()
    const { context, emit } = fakeContext()
    watchServerErrors(context, log)
    emit({
      url: () => {
        throw new Error('Target page, context or browser has been closed')
      },
      status: () => 503,
      request: () => ({ resourceType: () => 'fetch' }),
    })
    emit(response(503, `${PAGE}/feed`))
    // The unreadable one is lost; the readable one still refuses.
    expect(log.seen).toHaveLength(1)
    expect(log.seen[0].url).toBe(`${PAGE}/feed`)
  })

  it('a disposed REQUEST still yields a refusal, with the label degraded rather than the reading', () => {
    // The status and the URL are the load-bearing half of the message. Never lose a refusal over
    // the resource-type label on it.
    const error = serverErrorFrom({
      url: () => `${PAGE}/feed`,
      status: () => 503,
      request: () => {
        throw new Error('disposed')
      },
    })
    expect(error).toEqual({ url: `${PAGE}/feed`, status: 503, resourceType: 'unknown' })
  })

  it('a window of thousands prints a bounded, deduplicated message', () => {
    // 11,042 responses of 503 is the real number from 2026-09-14. A message that printed one line
    // each would bury the CI log, and a log you cannot read is the same as no message.
    const many = Array.from({ length: 400 }, (_, i) => response(503, `${PAGE}/api/read/${i % 25}`))
    const log = logAfter(...many)
    const message = serverErrorRefusal(log, '/feed') ?? ''
    expect(message).toContain('answered 400 request(s) with a server error')
    expect(message.split('\n').filter((line) => line.startsWith('  · '))).toHaveLength(10)
    expect(message).toContain('… and 15 further distinct URL+status pair(s).')
  })
})

describe('the wiring: the shared fixture installs the recorder on every context', () => {
  const fixtures = readFileSync('test/e2e/fixtures.ts', 'utf8')

  it('fixtures.ts provides the log and installs the recorder before the test gets the context', () => {
    // Source-shape, because the alternative is a browser. The ORDER is the assertion: a recorder
    // installed after `provide(context)` would miss the navigation it exists to watch.
    expect(fixtures).toContain('serverErrors: async ({}, provide)')
    expect(fixtures).toContain('createServerErrorLog()')
    const install = fixtures.indexOf('watchServerErrors(context, serverErrors)')
    const handoff = fixtures.indexOf('await provide(context)')
    expect(install).toBeGreaterThan(-1)
    expect(handoff).toBeGreaterThan(install)
    // The `context` fixture must DEPEND on `serverErrors`, or the spec would receive a different
    // log object from the one being filled.
    expect(fixtures).toMatch(/context: async \(\{ context, serverErrors \}/)
  })

  it('BOTH capture suites refuse, and each does it before it writes anything', () => {
    // The row says the guard covers a visual AND an a11y capture. The visual suite writes a PNG;
    // the a11y suite writes an observation line under PW_A11Y_UPDATE and a ratchet comparison
    // otherwise. Both are records of a degraded page if the guard runs too late.
    const visual = readFileSync('test/e2e/visual.spec.ts', 'utf8')
    const guard = visual.indexOf('assertNoServerErrors(serverErrors')
    const shutter = visual.indexOf('toHaveScreenshot(')
    expect(guard, 'visual.spec.ts does not refuse a degraded capture').toBeGreaterThan(-1)
    expect(shutter, 'the guard must run BEFORE the shutter').toBeGreaterThan(guard)

    const a11y = readFileSync('test/e2e/a11y.spec.ts', 'utf8')
    // In the a11y suite the guard is the last thing `open()` does, so BOTH audit paths inherit it
    // from one place rather than each remembering to call it.
    expect(a11y).toContain('assertNoServerErrors(serverErrors')
    const openEnd = a11y.indexOf('assertNoServerErrors(serverErrors')
    expect(a11y.indexOf('new AxeBuilder(', openEnd), 'the guard must run BEFORE axe').toBeGreaterThan(openEnd)
  })
})
