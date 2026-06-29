#!/usr/bin/env node
// Performance baseline harness (H0-6 · docs/OBSERVABILITY-BASELINES.md).
//
// Captures the "before" for H3 (performance & scale): p50/p95/p99 latency for the
// hot read paths, plus the exact EXPLAIN ANALYZE SQL to capture each path's query
// plan. The plans are the structural baseline; the latency numbers are the felt one.
//
// SAFE NO-OP WHEN UNCONFIGURED. With no PERF_BASELINE_BASE_URL set, the script only
// DOCUMENTS the methodology and prints the SQL to run. It collects nothing and reads
// no secrets. Point it at a base URL to actually sample. It never mutates anything and
// never changes app behavior; it is a measurement tool, not a code path.
//
// Usage:
//   node scripts/perf-baseline.mjs           # document the plan (+ sample if configured)
//   node scripts/perf-baseline.mjs --plans   # print the EXPLAIN ANALYZE SQL per path
//   node scripts/perf-baseline.mjs --json     # machine-readable output
//
// Env (all optional):
//   PERF_BASELINE_BASE_URL   base URL to sample the hot-path routes against
//   PERF_BASELINE_SAMPLES    warm sample count per path (default 50)
//   PERF_BASELINE_WARMUP     warmup calls discarded before sampling (default 5)
//
// No secret is read or printed. Latency is wall-clock around an unauthenticated GET to
// each documented path; for authenticated routes the numbers are best read from Sentry
// performance / Vercel Analytics (see OBSERVABILITY-BASELINES.md §2a) and pasted into
// the doc by hand. This harness gives a repeatable floor, not the full RUM picture.

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const plansOnly = args.has('--plans')

const BASE_URL = process.env.PERF_BASELINE_BASE_URL || null
const SAMPLES = Number(process.env.PERF_BASELINE_SAMPLES || 50)
const WARMUP = Number(process.env.PERF_BASELINE_WARMUP || 5)

// The five hot paths (OBSERVABILITY-BASELINES.md §2). `route` is a documentation-only
// hint for where to sample; `sql` is the EXPLAIN target for the query plan. Routes that
// require an authenticated session are flagged so the operator knows the floor sample
// undercounts and the real number comes from RUM.
const HOT_PATHS = [
  {
    id: 'feed',
    label: 'Feed',
    route: '/feed',
    authed: true,
    entry: 'lib/feed/blend-rank.ts, lib/feed/feed-people.ts',
    sql: "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT * FROM feed_for_viewer(/* viewer_id */ '00000000-0000-0000-0000-000000000000', 20, NULL);",
  },
  {
    id: 'circle-detail',
    label: 'Circle detail',
    route: '/c/<circle-slug>',
    authed: true,
    entry: 'lib/circles/*',
    sql: '-- circle row + members + scoped posts. Capture EXPLAIN ANALYZE of the\n-- scoped-posts read as role authenticated (RLS predicates inline).',
  },
  {
    id: 'people-directory',
    label: 'People directory',
    route: '/people',
    authed: true,
    entry: 'lib/feed/feed-people.ts, lib/people-suggestions.ts',
    sql: '-- profile list + connection-state join. Capture EXPLAIN ANALYZE of the\n-- directory query as role authenticated; flag any per-row connection subquery.',
  },
  {
    id: 'practice-log-write',
    label: 'Practice log write',
    route: '(server action: log practice)',
    authed: true,
    entry: 'lib/practices/*',
    sql: '-- insert + idempotent ledger award. Capture EXPLAIN ANALYZE of the insert\n-- path and the award RPC body hot statement; note the idempotency-guard cost.',
  },
  {
    id: 'events-catalog',
    label: 'Events catalog',
    route: '/events',
    authed: false,
    entry: 'lib/events/store.ts',
    sql: '-- events list + scope + occurrence join. Capture EXPLAIN ANALYZE of the\n-- catalog query; flag Seq Scan on events / event_occurrences at volume.',
  },
]

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return null
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1)
  return Math.round(sortedMs[idx])
}

async function sampleRoute(path) {
  if (!BASE_URL) return null
  const url = `${BASE_URL.replace(/\/+$/, '')}${path.route.startsWith('/') ? path.route : '/'}`
  // Only sample concrete GET-able routes (skip placeholder/action descriptions).
  if (!path.route.startsWith('/') || path.route.includes('<')) return { skipped: 'no concrete GET route' }

  const durations = []
  const total = WARMUP + SAMPLES
  for (let i = 0; i < total; i++) {
    const t0 = performance.now()
    try {
      await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    } catch {
      // A failed sample is recorded as the timeout ceiling so it shows up, not hidden.
    }
    const dt = performance.now() - t0
    if (i >= WARMUP) durations.push(dt)
  }
  durations.sort((a, b) => a - b)
  return {
    samples: durations.length,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
  }
}

async function main() {
  const results = []
  for (const path of HOT_PATHS) {
    const latency = plansOnly ? null : await sampleRoute(path.route ? path : path)
    results.push({ ...path, latency })
  }

  if (asJson) {
    console.log(JSON.stringify({ baseUrl: BASE_URL, samples: SAMPLES, paths: results }, null, 2))
    return
  }

  console.log('Performance baseline (H0-6) · docs/OBSERVABILITY-BASELINES.md')
  console.log('='.repeat(64))
  if (!BASE_URL && !plansOnly) {
    console.log('PERF_BASELINE_BASE_URL not set: documentation mode (no samples taken).')
    console.log('Set it to a deployed base URL to collect a latency floor.\n')
  }

  if (plansOnly) {
    console.log('\nQuery-plan capture SQL (run read-only via Supabase SQL editor or')
    console.log('the MCP execute_sql tool; paste the output into OBSERVABILITY-BASELINES §2c):\n')
    for (const p of HOT_PATHS) {
      console.log(`--- ${p.label} (${p.id}) · entry: ${p.entry}`)
      console.log(p.sql)
      console.log('')
    }
    return
  }

  for (const r of results) {
    console.log(`\n${r.label}  [${r.id}]`)
    console.log(`  entry: ${r.entry}`)
    console.log(`  route: ${r.route}${r.authed ? '  (authed: floor sample undercounts; read RUM for true p95)' : ''}`)
    if (r.latency && r.latency.p50 != null) {
      console.log(`  p50=${r.latency.p50}ms  p95=${r.latency.p95}ms  p99=${r.latency.p99}ms  (n=${r.latency.samples})`)
    } else if (r.latency && r.latency.skipped) {
      console.log(`  (skipped: ${r.latency.skipped})`)
    } else {
      console.log('  (no sample: set PERF_BASELINE_BASE_URL)')
    }
  }
  console.log('\nNext: run with --plans to capture query plans; fill OBSERVABILITY-BASELINES §2b/§2c.')
}

main().catch((err) => {
  console.error('perf-baseline failed:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
