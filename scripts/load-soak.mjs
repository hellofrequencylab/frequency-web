#!/usr/bin/env node
// Load and soak harness (LIVE-551, ADR-1621 · DEF-HARDEN H3 · docs/OBSERVABILITY-BASELINES.md §2d).
//
// Every H3 scale claim ("the feed holds at 10x", "the practice-log write stays sub-second") was
// unprovable because nothing in the repo could put load on the hot paths and read the answer back
// against the SLO table. scripts/perf-baseline.mjs samples one request at a time, which is a
// latency FLOOR, not a load test. This drives the five hot paths of §2 at a chosen arrival rate,
// records p50/p95/p99 and the error rate per path, compares each against the executable SLO table
// in lib/observability/slos.ts (never a re-typed number), and writes a machine-readable report.
//
// ── SAFETY, BEFORE ANYTHING ELSE ───────────────────────────────────────────────────────────────
//
// 🔴 A PREVIEW IS NOT ISOLATED. Local, preview and production share ONE Supabase project
// (docs/WORKFLOW.md, "One shared database"). Load on a preview deployment is load on the
// production database. So the harness is careful by construction:
//
//   · There is no default target. You pass --target (or LOAD_SOAK_TARGET); a preview URL is the
//     expected answer. There is no CI job that runs this against a deployment, on purpose.
//   · TWO LOCKS against production, both overridable only by --allow-production:
//       1. the HOST: frequencylocal.com and its subdomains (plus LOAD_SOAK_PRODUCTION_HOSTS) are
//          refused before a single request leaves this process;
//       2. the BUILD: one GET of <target>/api/status reads `build.env` (VERCEL_ENV, frozen at
//          build). `production` is refused, and a non-local target whose env cannot be read is
//          refused too, because "could not prove it is not production" is not a pass.
//   · A rate ceiling (MAX_RPS, the spike included) that no flag lifts.
//   · The one write path (practice-log) is OFF unless --writes is passed with a session and the
//     action id. It writes real rows into the shared database; see §2d before turning it on.
//   · Secrets (the session cookie, the Vercel protection-bypass secret) are read from env only
//     and never printed or written to the report.
//
// ── MODES ──────────────────────────────────────────────────────────────────────────────────────
//
//   node scripts/load-soak.mjs --smoke [--json] [--out f]
//       CI-safe self-test. Starts an in-process mock target on 127.0.0.1, drives every hot path
//       (the write included, against the mock), reads the REAL SLO table, and exits 1 unless the
//       report is complete and passing. Sends nothing off this machine.
//
//   node scripts/load-soak.mjs --target <preview-url> [--profile steady|spike|soak] [--rps N]
//       [--duration S] [--concurrency N] [--circle <slug>] [--writes] [--out f] [--json]
//       [--strict] [--data-volume "<text>"] [--region <region>] [--allow-production]
//
//   Profiles: steady = --rps for --duration (default 120 s); spike = --rps for 30 s, then 10x
//   --rps for --duration (default 60 s), then --rps for 30 s; soak = --rps for --duration
//   (default 1800 s). --rps defaults to 1, which is already far above today's measured rate.
//
//   Env: LOAD_SOAK_TARGET, LOAD_SOAK_COOKIE (a seeded member's session Cookie header),
//   VERCEL_AUTOMATION_BYPASS_SECRET (preview Deployment Protection), LOAD_SOAK_CIRCLE_SLUG,
//   LOAD_SOAK_PRACTICE_ACTION (the logPracticeAction Next-Action id of THAT build),
//   LOAD_SOAK_PRACTICE_ID (a seeded practice id), LOAD_SOAK_PRODUCTION_HOSTS (extra refused hosts).
//
//   Exit: 0 pass (or incomplete without --strict) · 1 an SLO breach, a failed smoke, or
//   incomplete with --strict · 2 refused or bad usage · 3 the SLO table could not be read.

import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const SLO_MODULE = 'lib/observability/slos.ts'

/** The SLO rows this harness judges against. A table missing any of them is a failure to read,
 *  not a pass (exit 3): a report with a blank target column cannot say anything. */
export const REQUIRED_SLOS = ['latency.read-hot-paths', 'latency.practice-log-write', 'error-rate.requests']

/** The five hot paths of OBSERVABILITY-BASELINES §2, as HTTP. `/network` and not `/people`:
 *  /people is a redirect into the Network hub (ADR-172), so timing it times a 307. */
export const HOT_PATHS = [
  { id: 'feed', label: 'Feed', method: 'GET', route: '/feed', authed: true, slo: 'latency.read-hot-paths' },
  {
    id: 'circle-detail',
    label: 'Circle detail',
    method: 'GET',
    route: '/circles/{circle}',
    authed: true,
    needs: 'circle',
    slo: 'latency.read-hot-paths',
  },
  { id: 'people-directory', label: 'People directory', method: 'GET', route: '/network', authed: true, slo: 'latency.read-hot-paths' },
  { id: 'events-catalog', label: 'Events catalog', method: 'GET', route: '/events', authed: false, slo: 'latency.read-hot-paths' },
  {
    // A Server Action, so it is a POST carrying the build's action id (logPracticeAction in
    // app/(main)/practices/actions.ts). The args are the action's positional arguments.
    id: 'practice-log-write',
    label: 'Practice log write',
    method: 'POST',
    route: '/practices',
    authed: true,
    write: true,
    slo: 'latency.practice-log-write',
  },
]

/** Requests per second, at the peak of any phase (the 10x spike included). No flag lifts it. */
export const MAX_RPS = 100
export const SPIKE_MULTIPLIER = 10
const DEFAULT_TIMEOUT_MS = 15_000
const USER_AGENT = 'frequency-load-soak/1 (LIVE-551)'
const PRODUCTION_HOSTS = ['frequencylocal.com']

// ── Target safety ───────────────────────────────────────────────────────────────────────────────

/**
 * Where a target points, from its host alone (lock 1). No network.
 * @param {string} hostname
 * @param {string[]} [extraProductionHosts]
 * @returns {'local' | 'preview' | 'production' | 'other'}
 */
export function classifyHost(hostname, extraProductionHosts = []) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return 'local'
  const prod = [...PRODUCTION_HOSTS, ...extraProductionHosts.map((x) => x.trim().toLowerCase()).filter(Boolean)]
  if (prod.some((p) => h === p || h.endsWith(`.${p}`))) return 'production'
  if (h.endsWith('.vercel.app')) return 'preview'
  return 'other'
}

/**
 * Lock 1: may this URL be contacted at all? Decided before any request.
 * @returns {{ ok: true, url: URL, hostKind: string } | { ok: false, reason: string }}
 */
export function preflightTarget(raw, { allowProduction = false, extraProductionHosts = [] } = {}) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: `not a URL: ${JSON.stringify(raw)}` }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: `unsupported protocol ${url.protocol}` }
  const hostKind = classifyHost(url.hostname, extraProductionHosts)
  if (url.protocol === 'http:' && hostKind !== 'local') {
    return { ok: false, reason: `plain http is only allowed for a local target, not ${url.hostname}` }
  }
  if (hostKind === 'production' && !allowProduction) {
    return {
      ok: false,
      reason: `${url.hostname} is production. Load a preview deployment instead, or pass --allow-production if the owner asked for exactly this.`,
    }
  }
  return { ok: true, url, hostKind }
}

/**
 * Lock 2: what the build says it is. `statusEnv` is `build.env` from <target>/api/status, or
 * null when it could not be read.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function guardBuildEnv({ hostKind, statusEnv, allowProduction = false }) {
  if (allowProduction) return { ok: true }
  if (statusEnv === 'production') {
    return { ok: false, reason: 'the target reports build.env = production at /api/status. Point at a preview.' }
  }
  if (statusEnv == null && hostKind !== 'local') {
    return {
      ok: false,
      reason: 'could not read build.env from /api/status, so nothing proves this target is not production. Fix the URL, or pass the Vercel bypass secret for a protected preview.',
    }
  }
  return { ok: true }
}

// ── The SLO table ───────────────────────────────────────────────────────────────────────────────

/**
 * Read SLOS from the SHIPPED module, never a copy: a child node with type stripping and the `@/`
 * resolver (scripts/probe-ts.mjs), the same way scripts/cron-freshness.mjs reads its partition.
 * Throws when the table is unreadable or a required row is missing.
 * @returns {Array<{ id: string, label: string, target: number, unit: string, direction: string }>}
 */
export function readSloTable() {
  const code = 'import("@/lib/observability/slos.ts").then((m) => { process.stdout.write(JSON.stringify(m.SLOS)) })'
  let out
  try {
    out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--import', path.join(REPO_ROOT, 'scripts/probe-ts.mjs'), '-e', code],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 },
    )
  } catch (e) {
    throw new Error(`could not read the SLO table from ${SLO_MODULE}: ${e instanceof Error ? e.message : String(e)}`)
  }
  let slos
  try {
    slos = JSON.parse(out)
  } catch {
    throw new Error(`${SLO_MODULE} printed no JSON for SLOS`)
  }
  return validateSlos(slos)
}

/** Throws unless every REQUIRED_SLOS row is present with a finite target and a direction. */
export function validateSlos(slos) {
  if (!Array.isArray(slos)) throw new Error(`${SLO_MODULE} exports no SLOS array`)
  for (const id of REQUIRED_SLOS) {
    const s = slos.find((x) => x && x.id === id)
    if (!s) throw new Error(`${SLO_MODULE} has no ${id} row; the harness has nothing to judge against`)
    if (!Number.isFinite(s.target) || (s.direction !== 'lower-is-better' && s.direction !== 'higher-is-better')) {
      throw new Error(`${SLO_MODULE} row ${id} has no usable target/direction`)
    }
  }
  return slos
}

/** Direction-aware comparison, the same rule as meetsSlo in slos.ts. */
function meets(slo, value) {
  if (!Number.isFinite(value)) return false
  return slo.direction === 'lower-is-better' ? value <= slo.target : value >= slo.target
}

// ── Profiles ────────────────────────────────────────────────────────────────────────────────────

/**
 * The phases a profile runs. Throws on a peak over MAX_RPS or a non-positive rate or duration.
 * @returns {Array<{ name: string, rps: number, durationS: number }>}
 */
export function buildPhases(profile, rps, durationS) {
  if (!(rps > 0)) throw new Error('--rps must be a positive number')
  let phases
  if (profile === 'smoke') phases = [{ name: 'smoke', rps: 50, durationS: 0.5 }]
  else if (profile === 'steady') phases = [{ name: 'steady', rps, durationS: durationS ?? 120 }]
  else if (profile === 'soak') phases = [{ name: 'soak', rps, durationS: durationS ?? 1800 }]
  else if (profile === 'spike') {
    phases = [
      { name: 'base', rps, durationS: 30 },
      { name: `spike-${SPIKE_MULTIPLIER}x`, rps: rps * SPIKE_MULTIPLIER, durationS: durationS ?? 60 },
      { name: 'recover', rps, durationS: 30 },
    ]
  } else throw new Error(`unknown profile ${JSON.stringify(profile)} (steady, spike, soak)`)
  for (const p of phases) {
    if (!(p.durationS > 0)) throw new Error('--duration must be a positive number of seconds')
    if (p.rps > MAX_RPS) {
      throw new Error(`phase ${p.name} would run at ${p.rps} rps, over the ${MAX_RPS} rps ceiling. The database behind a preview is production's.`)
    }
  }
  return phases
}

// ── Measuring ───────────────────────────────────────────────────────────────────────────────────

/** Nearest-rank percentile of an ascending array, rounded to 0.1 ms; null when empty. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[idx] * 10) / 10
}

function statusClass(status) {
  return status == null ? 'network' : `${Math.floor(status / 100)}xx`
}

/**
 * One path's verdict for one phase, as it appears in the report.
 * @typedef {{ id: string, label: string, method: string, route: string,
 *   slo: { id: string, target: number, unit: string }, requests: number,
 *   verdict: 'pass' | 'breach' | 'unmeasured' | 'skipped', reason?: string, dropped?: number,
 *   errors?: number, errorRatePct?: number | null, statuses?: Record<string, number>,
 *   p50?: number | null, p95?: number | null, p99?: number | null, max?: number | null }} PathResult
 */

/**
 * Judge one path's samples. Latency percentiles are over the responses that came back; a
 * timeout or a transport failure is an error with no latency. An error is a 5xx or no response,
 * which is what `error-rate.requests` counts ("5xx + unhandled").
 *
 * A path whose answers were mostly redirects or 401/403 is UNMEASURED, never a pass: that is the
 * latency of a login bounce, not of the page (an authed path with no session, or a stale one).
 *
 * @returns {PathResult}
 */
export function summarizePath({ path: hp, samples, dropped = 0, skipped = null, slo, errorSlo }) {
  const base = {
    id: hp.id,
    label: hp.label,
    method: hp.method,
    route: hp.route,
    slo: { id: slo.id, target: slo.target, unit: slo.unit },
  }
  if (skipped) return { ...base, requests: 0, verdict: 'skipped', reason: skipped }

  const requests = samples.length
  const statuses = {}
  const latencies = []
  let errors = 0
  let bounced = 0
  for (const s of samples) {
    const k = statusClass(s.status)
    statuses[k] = (statuses[k] ?? 0) + 1
    if (s.status == null || s.status >= 500) errors++
    if (s.status != null) latencies.push(s.ms)
    if (s.status != null && ((s.status >= 300 && s.status < 400) || s.status === 401 || s.status === 403)) bounced++
  }
  latencies.sort((a, b) => a - b)
  const errorRatePct = requests ? Math.round((errors / requests) * 100_000) / 1000 : null
  const out = {
    ...base,
    requests,
    dropped,
    errors,
    errorRatePct,
    statuses,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.length ? Math.round(latencies[latencies.length - 1] * 10) / 10 : null,
  }
  if (requests === 0) return { ...out, verdict: 'unmeasured', reason: 'no request was sent (every slot dropped at the concurrency cap)' }
  if (bounced / requests > 0.5) {
    return {
      ...out,
      verdict: 'unmeasured',
      reason: `${bounced} of ${requests} answers were redirects or 401/403, so this timed a login bounce, not the page. Set LOAD_SOAK_COOKIE to a live session of a seeded member.`,
    }
  }
  const breaches = []
  if (!meets(slo, out.p95 ?? NaN)) breaches.push(`p95 ${out.p95} ms over the ${slo.target} ${slo.unit} SLO (${slo.id})`)
  if (!meets(errorSlo, errorRatePct)) breaches.push(`error rate ${errorRatePct}% over the ${errorSlo.target}% SLO (${errorSlo.id})`)
  if (dropped > 0) breaches.push(`${dropped} request(s) dropped at the concurrency cap: the target could not keep up with the arrival rate`)
  return breaches.length ? { ...out, verdict: 'breach', reason: breaches.join('; ') } : { ...out, verdict: 'pass' }
}

/** Build the request for one hot path, or return the reason it cannot run. */
export function requestFor(hp, ctx) {
  if (hp.needs === 'circle' && !ctx.circleSlug) return { skip: 'no circle slug: pass --circle <slug> or LOAD_SOAK_CIRCLE_SLUG (a seeded Circle)' }
  if (hp.write) {
    if (!ctx.writes) return { skip: 'writes are off: pass --writes to log practices into the shared database (§2d)' }
    const missing = [
      !ctx.cookie && 'LOAD_SOAK_COOKIE',
      !ctx.practiceAction && 'LOAD_SOAK_PRACTICE_ACTION',
      !ctx.practiceId && 'LOAD_SOAK_PRACTICE_ID',
    ].filter(Boolean)
    if (missing.length) return { skip: `--writes needs ${missing.join(', ')}` }
  }
  const route = hp.route.replace('{circle}', encodeURIComponent(ctx.circleSlug ?? ''))
  const headers = { 'user-agent': USER_AGENT, accept: hp.write ? 'text/x-component' : 'text/html' }
  if (ctx.cookie) headers.cookie = ctx.cookie
  if (ctx.bypass) headers['x-vercel-protection-bypass'] = ctx.bypass
  if (!hp.write) return { url: new URL(route, ctx.origin).toString(), init: { method: 'GET', headers } }
  headers['next-action'] = ctx.practiceAction
  headers['content-type'] = 'text/plain;charset=UTF-8'
  // logPracticeAction(practiceId, circleId, clientTimezone, timed): positional, JSON-encoded.
  const body = JSON.stringify([ctx.practiceId, null, 'UTC', null])
  return { url: new URL(route, ctx.origin).toString(), init: { method: 'POST', headers, body } }
}

async function timedRequest(fetchImpl, req, timeoutMs) {
  const t0 = performance.now()
  try {
    const res = await fetchImpl(req.url, { ...req.init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    // Read the whole body: a streamed RSC page is not done at its first byte.
    await res.arrayBuffer()
    return { ms: performance.now() - t0, status: res.status }
  } catch {
    return { ms: performance.now() - t0, status: null }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * One phase, OPEN model: request i is due at start + i/rps whatever the target is doing, and
 * the paths take turns. When `concurrency` requests are already in flight the slot is DROPPED
 * and counted, so a saturated target shows up as drops instead of silently slowing the clock
 * (the coordinated-omission trap of a closed loop).
 */
export async function runPhase({ phase, runnable, concurrency, timeoutMs, fetchImpl }) {
  const per = new Map(runnable.map((r) => [r.path.id, { samples: [], dropped: 0 }]))
  const total = Math.max(1, Math.round(phase.rps * phase.durationS))
  const gapMs = 1000 / phase.rps
  const start = performance.now()
  const inflight = new Set()
  for (let i = 0; i < total; i++) {
    const due = start + i * gapMs
    const wait = due - performance.now()
    if (wait > 0) await sleep(wait)
    const r = runnable[i % runnable.length]
    const bucket = per.get(r.path.id)
    if (inflight.size >= concurrency) {
      bucket.dropped++
      continue
    }
    const p = timedRequest(fetchImpl, r.req, timeoutMs).then((s) => {
      bucket.samples.push(s)
      inflight.delete(p)
    })
    inflight.add(p)
  }
  await Promise.all(inflight)
  return per
}

/**
 * Run every phase against `origin` and build the report. Pure of process state: the caller
 * passes the SLO table, the context and the fetch.
 */
export async function runLoad({ origin, phases, slos, ctx, concurrency = 20, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) {
  const byId = new Map(slos.map((s) => [s.id, s]))
  const errorSlo = byId.get('error-rate.requests')
  const plan = HOT_PATHS.map((hp) => {
    const r = requestFor(hp, { ...ctx, origin })
    return 'skip' in r ? { path: hp, skip: r.skip } : { path: hp, req: r }
  })
  const runnable = plan.filter((p) => !p.skip)
  const phaseReports = []
  for (const phase of phases) {
    const per = runnable.length ? await runPhase({ phase, runnable, concurrency, timeoutMs, fetchImpl }) : new Map()
    const paths = plan.map((p) =>
      summarizePath({
        path: p.path,
        samples: per.get(p.path.id)?.samples ?? [],
        dropped: per.get(p.path.id)?.dropped ?? 0,
        skipped: p.skip ?? null,
        slo: byId.get(p.path.slo),
        errorSlo,
      }),
    )
    const measured = paths.filter((x) => x.verdict !== 'skipped')
    const reqs = measured.reduce((n, x) => n + x.requests, 0)
    const errs = measured.reduce((n, x) => n + (x.errors ?? 0), 0)
    const errorRatePct = reqs ? Math.round((errs / reqs) * 100_000) / 1000 : null
    phaseReports.push({
      ...phase,
      requests: reqs,
      errorRatePct,
      errorRateVerdict: errorRatePct == null ? 'unmeasured' : meets(errorSlo, errorRatePct) ? 'pass' : 'breach',
      paths,
    })
  }
  const all = phaseReports.flatMap((p) => p.paths)
  const verdict =
    all.some((p) => p.verdict === 'breach') || phaseReports.some((p) => p.errorRateVerdict === 'breach')
      ? 'breach'
      : all.some((p) => p.verdict !== 'pass')
        ? 'incomplete'
        : 'pass'
  return {
    phases: phaseReports,
    slos: {
      source: SLO_MODULE,
      read: REQUIRED_SLOS.map((id) => {
        const s = byId.get(id)
        return { id, target: s.target, unit: s.unit, direction: s.direction }
      }),
    },
    verdict,
  }
}

// ── The CI-safe mock target ─────────────────────────────────────────────────────────────────────

/**
 * An in-process stand-in for a deployment, on 127.0.0.1 and an ephemeral port. Answers
 * /api/status as build.env `mock`, the four read routes, and a POST carrying a Next-Action.
 * `delayMs` and `statusFor(pathname)` let a test make it slow or failing.
 * @param {{ delayMs?: number, statusFor?: (pathname: string) => number }} [opts]
 * @returns {Promise<{ origin: string, hits: () => number, close: () => Promise<void> }>}
 */
export function startMockTarget({ delayMs = 1, statusFor = () => 200 } = {}) {
  let hits = 0
  const server = createServer((req, res) => {
    hits++
    const { pathname } = new URL(req.url ?? '/', 'http://mock')
    const reply = (status, type, body) => {
      res.writeHead(status, { 'content-type': type })
      res.end(body)
    }
    if (pathname === '/api/status') return reply(200, 'application/json', JSON.stringify({ build: { env: 'mock', commit: 'mock' } }))
    const known =
      (req.method === 'GET' && ['/feed', '/network', '/events'].includes(pathname)) ||
      (req.method === 'GET' && pathname.startsWith('/circles/')) ||
      (req.method === 'POST' && pathname === '/practices' && req.headers['next-action'])
    const status = known ? statusFor(pathname) : 404
    req.resume()
    setTimeout(() => reply(status, 'text/html', '<!doctype html><title>mock</title>'), delayMs)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({
        origin: `http://127.0.0.1:${port}`,
        hits: () => hits,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

/** Parse argv and env into options. Secrets come from env only. */
export function parseArgs(argv, env = {}) {
  const o = {
    smoke: false,
    json: false,
    strict: false,
    writes: false,
    allowProduction: false,
    help: false,
    target: env.LOAD_SOAK_TARGET || null,
    profile: 'steady',
    rps: 1,
    durationS: undefined,
    concurrency: 20,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    out: null,
    circleSlug: env.LOAD_SOAK_CIRCLE_SLUG || null,
    dataVolume: null,
    region: null,
    cookie: env.LOAD_SOAK_COOKIE || null,
    bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET || null,
    practiceAction: env.LOAD_SOAK_PRACTICE_ACTION || null,
    practiceId: env.LOAD_SOAK_PRACTICE_ID || null,
    extraProductionHosts: (env.LOAD_SOAK_PRODUCTION_HOSTS || '').split(',').filter(Boolean),
  }
  const flags = { '--smoke': 'smoke', '--json': 'json', '--strict': 'strict', '--writes': 'writes', '--allow-production': 'allowProduction', '--help': 'help', '-h': 'help' }
  const values = { '--target': 'target', '--profile': 'profile', '--rps': 'rps', '--duration': 'durationS', '--concurrency': 'concurrency', '--timeout-ms': 'timeoutMs', '--out': 'out', '--circle': 'circleSlug', '--data-volume': 'dataVolume', '--region': 'region' }
  const numeric = new Set(['rps', 'durationS', 'concurrency', 'timeoutMs'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const [k, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined]
    if (flags[k]) o[flags[k]] = true
    else if (values[k]) {
      const v = inline ?? argv[++i]
      if (v == null) throw new Error(`${k} needs a value`)
      o[values[k]] = numeric.has(values[k]) ? Number(v) : v
      if (numeric.has(values[k]) && !Number.isFinite(o[values[k]])) throw new Error(`${k} needs a number, got ${JSON.stringify(v)}`)
    } else throw new Error(`unknown argument ${a}`)
  }
  if (!(o.concurrency >= 1)) throw new Error('--concurrency must be at least 1')
  return o
}

const USAGE = `Usage:
  node scripts/load-soak.mjs --smoke [--json]                      CI-safe self-test against a local mock
  node scripts/load-soak.mjs --target <preview-url> [--profile steady|spike|soak] [--rps N] [--duration S]
                             [--circle <slug>] [--writes] [--out file] [--json] [--strict]
Read docs/OBSERVABILITY-BASELINES.md §2d first: a preview shares production's database.`

async function readBuild(fetchImpl, origin, bypass) {
  try {
    const headers = { 'user-agent': USER_AGENT, accept: 'application/json' }
    if (bypass) headers['x-vercel-protection-bypass'] = bypass
    const res = await fetchImpl(new URL('/api/status', origin).toString(), { headers, redirect: 'manual', signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) })
    if (!res.ok) return null
    const body = await res.json()
    const env = body?.build?.env
    return typeof env === 'string' && env ? { env, commit: body?.build?.commit ?? null } : null
  } catch {
    return null
  }
}

function renderText(report) {
  const lines = [`Load and soak (LIVE-551) · ${report.mode} · ${report.target.origin} (${report.target.hostKind}, build.env ${report.target.env ?? 'unknown'}, commit ${report.target.commit ?? 'unknown'})`]
  lines.push(`SLOs read from ${report.slos.source}: ${report.slos.read.map((s) => `${s.id} ${s.target}${s.unit}`).join(' · ')}`)
  for (const ph of report.phases) {
    lines.push('', `Phase ${ph.name}: ${ph.rps} rps for ${ph.durationS}s, ${ph.requests} requests, error rate ${ph.errorRatePct ?? '-'}% (${ph.errorRateVerdict})`)
    for (const p of ph.paths) {
      const nums = p.requests ? `n=${p.requests} p50=${p.p50} p95=${p.p95} p99=${p.p99} ms err=${p.errorRatePct}% dropped=${p.dropped}` : ''
      lines.push(`  ${p.verdict.toUpperCase().padEnd(10)} ${p.label.padEnd(20)} ${nums}${p.reason ? `  · ${p.reason}` : ''}`)
    }
  }
  lines.push('', `Verdict: ${report.verdict}${report.out ? ` · report written to ${report.out}` : ''}`)
  if (report.mode !== 'smoke') lines.push('State the data volume and region when you paste this into OBSERVABILITY-BASELINES §2b.')
  return lines.join('\n')
}

/**
 * The command. Returns the exit code; never calls process.exit, so tests drive it directly.
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, log?: (s: string) => void, err?: (s: string) => void, readSlos?: () => any[], now?: () => Date }} [io]
 */
export async function main(argv, io = {}) {
  const env = io.env ?? process.env
  const fetchImpl = io.fetchImpl ?? fetch
  const log = io.log ?? ((s) => console.log(s))
  const err = io.err ?? ((s) => console.error(s))
  const now = io.now ?? (() => new Date())

  let o
  try {
    o = parseArgs(argv, env)
  } catch (e) {
    err(`load-soak: ${e instanceof Error ? e.message : String(e)}\n${USAGE}`)
    return 2
  }
  if (o.help) {
    log(USAGE)
    return 0
  }

  const refuse = (reason) => {
    if (o.json) log(JSON.stringify({ refused: true, reason }))
    err(`🔴 load-soak refused: ${reason}`)
    return 2
  }

  let mock = null
  let origin
  let hostKind
  if (o.smoke) {
    mock = await startMockTarget()
    origin = mock.origin
    hostKind = 'local'
    Object.assign(o, { profile: 'smoke', writes: true, cookie: 'smoke=1', circleSlug: 'smoke', practiceAction: 'smoke', practiceId: 'smoke', bypass: null })
  } else {
    if (!o.target) return refuse('no target. Pass --target <preview-url> (or LOAD_SOAK_TARGET). There is no default, by design.')
    const pre = preflightTarget(o.target, { allowProduction: o.allowProduction, extraProductionHosts: o.extraProductionHosts })
    if (!pre.ok) return refuse(pre.reason)
    origin = pre.url.origin
    hostKind = pre.hostKind
  }

  try {
    let phases
    try {
      phases = buildPhases(o.profile, o.rps, o.durationS)
    } catch (e) {
      return refuse(e instanceof Error ? e.message : String(e))
    }

    let slos
    try {
      slos = (io.readSlos ?? readSloTable)()
      validateSlos(slos)
    } catch (e) {
      err(`🔴 load-soak: ${e instanceof Error ? e.message : String(e)}`)
      return 3
    }

    const build = await readBuild(fetchImpl, origin, o.bypass)
    const guard = guardBuildEnv({ hostKind, statusEnv: build?.env ?? null, allowProduction: o.allowProduction })
    if (!guard.ok) return refuse(guard.reason)

    const startedAt = now().toISOString()
    const result = await runLoad({
      origin,
      phases,
      slos,
      concurrency: o.concurrency,
      timeoutMs: o.timeoutMs,
      fetchImpl,
      ctx: { circleSlug: o.circleSlug, writes: o.writes, cookie: o.cookie, bypass: o.bypass, practiceAction: o.practiceAction, practiceId: o.practiceId },
    })

    const report = {
      harness: 'load-soak',
      version: 1,
      row: 'LIVE-551',
      mode: o.smoke ? 'smoke' : 'run',
      profile: o.profile,
      startedAt,
      finishedAt: now().toISOString(),
      target: { origin, hostKind, env: build?.env ?? null, commit: build?.commit ?? null },
      config: {
        concurrency: o.concurrency,
        timeoutMs: o.timeoutMs,
        auth: o.cookie ? 'session cookie' : 'anonymous',
        protectionBypass: Boolean(o.bypass),
        writes: o.writes,
      },
      dataVolume: o.dataVolume,
      region: o.region,
      ...result,
    }

    const out = o.out ?? (o.smoke ? null : `load-soak-${o.profile}-${startedAt.replace(/[:.]/g, '-')}.json`)
    if (out) {
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
      report.out = out
    }
    log(o.json ? JSON.stringify(report, null, 2) : renderText(report))

    if (o.smoke) {
      // The self-test: every path measured, every SLO read, the mock actually hit.
      const complete = report.verdict === 'pass' && report.phases.every((p) => p.paths.every((x) => x.verdict === 'pass' && x.requests > 0))
      if (!complete) err('🔴 load-soak smoke: the harness did not measure every hot path against the mock')
      return complete ? 0 : 1
    }
    if (report.verdict === 'breach') return 1
    if (report.verdict === 'incomplete') {
      err('⚠️ load-soak: incomplete. Some hot paths were skipped or unmeasured; the report says why.')
      return o.strict ? 1 : 0
    }
    return 0
  } finally {
    if (mock) await mock.close()
  }
}

if (invokedDirectly(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(`🔴 load-soak could not run: ${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 1
    },
  )
}
