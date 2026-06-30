# Observability Baselines & SLOs

> **Status: scaffold live (2026-06-29).** This is the home for H0-6 (performance
> baseline), H0-7 (cost baseline), and H0-8 (SLOs) from
> [`FOUNDATION-HARDENING-PLAN.md`](FOUNDATION-HARDENING-PLAN.md). It defines the
> methodology, the tables that capture the numbers, and the target SLOs every later
> phase is judged against. The "before" numbers here are the bar H3 (performance &
> scale) must beat at 10x load.
>
> **Authority order (unchanged):** running code + `supabase/migrations/` > this doc >
> Notion. Sentry (H0-4) and cron heartbeats (H0-5) are already merged and feed the
> live signals this doc holds targets for.
>
> **Companion:** [`ANALYTICS.md`](ANALYTICS.md) (product metrics, WAM),
> [`AI-CONTROLS.md`](AI-CONTROLS.md) (Anthropic spend caps). This doc owns the
> infrastructure-side baselines: latency, cost, and the SLO contract.

---

## 1. Why this exists

You cannot harden what you cannot see, and you cannot prove a performance fix worked
without a "before." This doc gives three things every later phase needs:

1. **A performance baseline** (H0-6): p50/p95 latency plus a captured query plan for
   each hot read path, so H3 has a measured starting point and a target to beat.
2. **A cost baseline** (H0-7): current spend by vendor and a per-1k-members unit cost,
   so scale decisions in H3 are made with the money in view, not guessed.
3. **SLO targets** (H0-8): written, with rationale, so "good enough" stops being a
   feeling and becomes a number a deploy can be checked against.

The principle from the plan holds: measure before you change. Nothing in H3 ships
without a baseline row here that proves it was needed and proves it worked.

---

## 2. The hot read paths (H0-6 scope)

These five paths carry the bulk of member traffic and are the ones H3 optimizes. Each
gets a p50/p95 latency capture and a query plan. The "entry point" column names the
code that owns the query so the plan is reproducible.

| Path | What the member does | Entry point | Underlying query |
|---|---|---|---|
| **Feed** | Loads their home feed | `lib/feed/blend-rank.ts`, `lib/feed/feed-people.ts` | `feed_for_viewer` / `scoped_feed_for_viewer` RPC |
| **Circle detail** | Opens a Circle page | `lib/circles/*` | circle row + members + scoped posts |
| **People directory** | Browses people / suggestions | `lib/feed/feed-people.ts`, `lib/people-suggestions.ts` | profile list + connection-state join |
| **Practice log write** | Logs a practice (North-Star write) | `lib/practices/*` | practice insert + ledger award (idempotent) |
| **Events catalog** | Browses the events list | `lib/events/store.ts` | events list + scope + occurrence join |

**Note on the one write path.** Practice-log write is included deliberately: it is the
`practice.verified` North-Star emitter and the one hot path that mutates the ledger, so
its tail latency (and the idempotency guard's cost) matters as much as the reads.

### 2a. Methodology

The baseline is captured **against production** (or a production-shaped snapshot) at a
known date, then re-captured after any H3 change that touches the path.

**Latency (p50/p95):** two independent sources, recorded together so they cross-check.

1. **Server timing (authoritative for the query).** Wrap the path's data call and
   record wall-clock ms. The `scripts/perf-baseline.mjs` harness documents the exact
   call per path and, when pointed at a configured endpoint, collects N samples and
   reports p50/p95/p99. Default N = 50 warm samples after 5 warmup calls.
2. **Edge / RUM (authoritative for what the member feels).** Vercel Analytics +
   Sentry performance (H0-4) already capture route-level p50/p95 in production. Read
   these for the same window and record them next to the server number; a large gap
   between "query fast, route slow" points at render/serialization cost, not the DB.

Record the **date, the dataset size** (row counts for the tables the path touches), and
the **region** the sample ran from. A p95 is meaningless without knowing how much data
it ran against, because the whole point of H3 is to keep it flat as the data grows.

**Query plan (the "before" for H3):** for each path, capture
`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` of the underlying query (or the RPC body's
hot statement) and paste it into §2c. Capture it **as the role the path runs as** (RLS
matters: the `authenticated` plan can differ sharply from the `service_role` plan
because policy predicates are inlined). Flag any **Seq Scan on a large table**, any
**per-row subquery** in an RLS predicate (this is exactly H3-1), and the **rows-removed
-by-filter** ratio.

### 2b. Latency baseline table (fill in on capture)

> Capture date: _pending_. Dataset size at capture: _pending_ (record per-table row
> counts). Region: _pending_.

| Path | Server p50 (ms) | Server p95 (ms) | Route p50 (ms) | Route p95 (ms) | Rows scanned | Plan ref |
|---|---|---|---|---|---|---|
| Feed | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | §2c.1 |
| Circle detail | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | §2c.2 |
| People directory | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | §2c.3 |
| Practice log write | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | §2c.4 |
| Events catalog | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | §2c.5 |

### 2c. Query plans (paste captured `EXPLAIN ANALYZE` here)

Keep each plan dated and labeled with the role it ran as, so a later re-capture is a
clean diff. The `scripts/perf-baseline.mjs --plans` mode prints the exact SQL to run via
the Supabase MCP `execute_sql` (read-only) or the SQL editor for each path.

1. **Feed** (`feed_for_viewer`, role `authenticated`): _pending capture._
2. **Circle detail**: _pending capture._
3. **People directory**: _pending capture._
4. **Practice log write** (insert + award path): _pending capture._
5. **Events catalog**: _pending capture._

---

## 3. Cost baseline (H0-7)

Snapshot spend by vendor and derive a per-1k-members unit cost, so the scale decisions in
H3 (geocoder swap, partitioning, CDN, read replicas) are made cost-aware. Re-snapshot
monthly; the trend matters more than any single month.

### 3a. Per-vendor spend

> Snapshot month: _pending_. Active members at snapshot (denominator): _pending_.
> Source for each figure: the vendor's own billing console (not estimated).

| Vendor | What it bills for | Plan / tier | Monthly spend (USD) | Primary cost driver | Notes |
|---|---|---|---|---|---|
| **Supabase** | Postgres, Auth, Storage, Realtime, egress | _tbd_ | _tbd_ | DB compute + storage + egress | watch egress as media grows (H3-6) |
| **Vercel** | Hosting, edge, functions, bandwidth, Analytics | _tbd_ | _tbd_ | function invocations + bandwidth | 18 crons + RSC traffic |
| **Anthropic** | Vera + embeddings (Claude API) | _tbd_ | _tbd_ | tokens (Haiku-default) | governed by AI-CONTROLS.md caps |
| **Resend** | Transactional + digest email | _tbd_ | _tbd_ | emails sent / month | digest + lifecycle + nurture |
| **Upstash** | Redis (rate-limit, cache) | _tbd_ | _tbd_ | commands / month | sliding-window rate limits |
| **Total** | | | **_tbd_** | | |

Add any other live vendor (geocoder once H3-3 swaps off keyless Nominatim, a CDN once
H3-6 lands, Sentry once volume exceeds the free tier) as a row when it starts billing.

### 3b. Unit economics (per 1,000 members)

The number that makes scale legible: divide each vendor's monthly spend by
(active members / 1000). This is what a marginal 1k members costs to serve today, and the
quantity H3 is trying to hold flat or bend down as the denominator grows.

| Metric | Value | How it is derived |
|---|---|---|
| Active members (denominator) | _tbd_ | WAM or MAU at snapshot (state which) |
| Total infra spend / month | _tbd_ | sum of §3a |
| **Cost per 1k members / month** | **_tbd_** | total spend / (members / 1000) |
| Supabase per 1k | _tbd_ | Supabase spend / (members / 1000) |
| Vercel per 1k | _tbd_ | Vercel spend / (members / 1000) |
| Anthropic per 1k | _tbd_ | Anthropic spend / (members / 1000) |
| Resend per 1k | _tbd_ | Resend spend / (members / 1000) |
| Upstash per 1k | _tbd_ | Upstash spend / (members / 1000) |

**Reading it:** a per-1k cost that rises with the denominator means a path scales
super-linearly and is an H3 target. A flat or falling per-1k cost means the
architecture is absorbing growth, which is the goal.

---

## 4. SLO targets (H0-8)

These are the targets later phases hold the line against. They are deliberately
achievable-but-honest for the current single-region beta scale, and tightened as the
foundation hardens. Each has a rationale, because an SLO without a reason gets
negotiated away the first time it is inconvenient.

The **window** for every SLO below is a rolling 28 days unless stated. The **signal**
column names where the number is read from (all already wired or read from the vendor).

| SLO | Target | Window | Signal | Rationale |
|---|---|---|---|---|
| **Uptime** (app reachable, 2xx/3xx on health path) | **99.9%** | 28d | Vercel + uptime monitor | ~43 min/month budget. Honest for single-region serverless; not five-nines we cannot yet back. |
| **p95 latency, read hot paths** (feed, circle, directory, events) | **< 800 ms** | 28d | Sentry perf / Vercel Analytics | A member-facing read over ~800ms feels slow. This is the bar the H0-6 plans must beat at 10x load. |
| **p95 latency, practice-log write** | **< 1000 ms** | 28d | Sentry perf | The write does an insert + idempotent ledger award; a slightly looser bar than reads, still sub-second-ish. |
| **Error rate** (5xx + unhandled, per request) | **< 0.5%** | 28d | Sentry (H0-4) | 1 in 200 requests. Tight enough that a real regression pages; loose enough to absorb transient upstream blips. |
| **Queue lag** (`process-queue` email worker backlog age) | **< 10 min** | live | worker log + heartbeat | The worker runs every 2 min; a backlog older than ~5 cycles means it is falling behind and a human should look (H4-2). |
| **Cron freshness** (each of 18 jobs ran within its schedule + grace) | **100% of jobs fresh** | per job | cron heartbeat (H0-5) dead-man's-switch | A silently-dead cron is the exact future problem H0-5 exists to prevent. Grace = one interval. Any stale job = page. |

### 4a. Per-cron freshness windows

Cron freshness is per-job because the schedules differ widely. A job is **fresh** if its
last success heartbeat (H0-5) arrived within `schedule interval + 1 interval` of grace.
The frequent jobs are the ones whose silence is most dangerous:

| Job | Schedule | Fresh-by (interval + grace) | Why it matters |
|---|---|---|---|
| `process-queue` | every 2 min | 4 min | email + async work backlog (H4-2) |
| `publish-scheduled` | every 5 min | 10 min | scheduled content goes live on time |
| `season-go-live` | every 10 min | 20 min | season transitions; silent failure breaks the economy |
| `nurture` / `event-reminders` | every 15 min | 30 min | member re-engagement + event attendance |
| `referral-release` / `embed-events` | every 30 min | 60 min | referral payouts + event search freshness |
| daily jobs (`weekly-digest`, `lifecycle-triggers`, `enforce-retention`, embed-* nightly, etc.) | daily / weekly | 1 interval + grace | digest delivery, retention, embeddings |

The full 18-job list is the source of truth in `vercel.json`; this table groups them by
the urgency of their silence. The heartbeat monitor (H0-5) owns the paging; this row sets
the contract it pages against.

**Checking the contract.** `scripts/cron-freshness.mjs` reads `vercel.json`, derives each
job's fresh-by window (2 × interval per the rule above), and reports whether a heartbeat
monitor is configured for it — so a *paging-blind* cron (one whose silent death would
never reach a human) is visible instead of assumed-covered. It reads no secret; it only
checks for the presence of the `CRON_HEARTBEAT_*` env vars `cron-heartbeat.ts` resolves.
Run `pnpm check:cron-freshness` to print the table, or `--strict` in CI to fail when any
job lacks monitor coverage.

### 4b. What happens when an SLO is breached

- **Page (immediate):** uptime, error rate, any cron going stale, queue lag over budget.
  These have a wired signal (Sentry / heartbeat) and a human is expected to respond.
- **Track (review):** p95 latency drift. A single slow window is noise; a sustained p95
  over target opens an H3 investigation against the relevant §2c plan.
- **The contract:** an H3 change is "done" for a path only when that path's p95 is back
  under its SLO *and* the re-captured §2c plan shows the structural fix (no new Seq Scan,
  no per-row RLS subquery). Beating the SLO without fixing the plan is a regression
  waiting to happen at the next data-size doubling.

---

## 5. How to run the baseline scripts

Two dependency-light Node scripts document and (when configured) collect the baselines.
Both are **safe no-ops when unconfigured** and never hardcode secrets; they read from the
environment. Neither changes app behavior.

```bash
# Performance baseline: prints the per-path methodology, the exact EXPLAIN SQL to run,
# and, when PERF_BASELINE_BASE_URL is set, collects p50/p95/p99 latency samples.
node scripts/perf-baseline.mjs            # documents the plan; no-op collection if unset
node scripts/perf-baseline.mjs --plans    # print the EXPLAIN ANALYZE SQL for each path
node scripts/perf-baseline.mjs --json     # machine-readable output for pasting into §2

# Cost baseline: prints the per-vendor + unit-economics template and, when the
# corresponding *_MONTHLY_SPEND_USD and BASELINE_ACTIVE_MEMBERS env vars are set,
# computes the per-1k-members unit costs for §3b.
node scripts/cost-baseline.mjs            # prints the template + any computed unit costs
node scripts/cost-baseline.mjs --json     # machine-readable output

# Cron freshness: reads vercel.json, derives each of the 18 jobs' §4a fresh-by window,
# and reports which jobs have a heartbeat monitor configured (presence only — no secret
# read). Use --strict in CI to fail when a cron is paging-blind.
node scripts/cron-freshness.mjs           # print the freshness contract table
node scripts/cron-freshness.mjs --json    # machine-readable output
node scripts/cron-freshness.mjs --strict  # exit 1 if any job has no monitor
```

**Environment (all optional; unset = documentation-only no-op):**

| Var | Used by | Purpose |
|---|---|---|
| `PERF_BASELINE_BASE_URL` | perf | base URL to sample the hot-path routes against |
| `PERF_BASELINE_SAMPLES` | perf | sample count (default 50) |
| `BASELINE_ACTIVE_MEMBERS` | cost | denominator for the per-1k unit cost |
| `SUPABASE_MONTHLY_SPEND_USD` | cost | this month's Supabase bill |
| `VERCEL_MONTHLY_SPEND_USD` | cost | this month's Vercel bill |
| `ANTHROPIC_MONTHLY_SPEND_USD` | cost | this month's Anthropic bill |
| `RESEND_MONTHLY_SPEND_USD` | cost | this month's Resend bill |
| `UPSTASH_MONTHLY_SPEND_USD` | cost | this month's Upstash bill |
| `CRON_HEARTBEAT_BASE_URL` | cron-freshness | presence-checked (not read) to mark every job covered |
| `CRON_HEARTBEAT_URL_<SLUG>` | cron-freshness | presence-checked (not read) to mark one job covered |

No secret (API key, DSN, service-role key) is read or printed by either script. Spend
figures are non-sensitive dollar amounts you copy from each vendor's billing console.

---

## 6. Cadence

| Cadence | Action |
|---|---|
| **Once now (H0 close-out)** | Owner fills the §2b latency table + §2c plans, the §3a/§3b cost tables. Scripts make this mechanical. |
| **Per H3 change** | Re-capture the affected path's row in §2b + its §2c plan; confirm it beats the §4 SLO. |
| **Monthly** | Re-run `cost-baseline.mjs`, append a dated §3 snapshot; watch the per-1k trend. |
| **Per deploy / CI** | `pnpm check:cron-freshness --strict` confirms no cron is paging-blind (every §4a job has a heartbeat monitor) before shipping. |
| **Per incident** | If an SLO pages, the runbook (H4-7) references the relevant §4 row. |
```
