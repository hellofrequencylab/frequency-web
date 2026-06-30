# Service-Level Objectives (SLOs)

> **Status: SLOs as code (2026-06-29).** This is the prose companion to
> [`lib/observability/slos.ts`](../lib/observability/slos.ts), which holds the same
> SLO contract as typed, machine-readable data. It expands on H0-8 from
> [`OBSERVABILITY-BASELINES.md`](OBSERVABILITY-BASELINES.md) §4, whose table this
> module mirrors. Where this doc and the code disagree, **the code is the one a deploy
> is checked against** (it is executable); keep this doc in step with it.
>
> **Authority order (unchanged):** running code + `supabase/migrations/` > this doc >
> Notion. The signals these SLOs read from — Sentry (H0-4), cron heartbeats (H0-5),
> Vercel Analytics — are already wired.

---

## 1. Why SLOs as code

`OBSERVABILITY-BASELINES.md` §4 wrote the SLOs as a prose table: a human reads it and
decides whether a deploy is within budget. That is the right place for the *rationale*,
but a prose number drifts — it gets re-typed, rounded, or quietly forgotten. Codifying
the same contract in [`lib/observability/slos.ts`](../lib/observability/slos.ts) gives
three things the table alone cannot:

1. **One source of truth.** A status endpoint, the cron heartbeat monitor, a CI gate, or
   a dashboard can all import the exact target instead of hardcoding their own copy.
2. **Direction-correctness for free.** `meetsSlo()` knows that uptime is higher-is-better
   and latency is lower-is-better, so a consumer can never get the comparison backwards.
3. **A testable contract.** `slos.test.ts` asserts the table stays in lockstep with
   reality (e.g. all 18 `vercel.json` cron jobs are covered exactly once).

This change is **strictly additive**: pure data and pure functions, no I/O, no env var,
no secret, no schema. Importing the module has zero side effects; nothing reads it yet —
it is the contract later phases (a `/api/status` endpoint, an H4 runbook check) consume.

---

## 2. The SLOs

These mirror [`OBSERVABILITY-BASELINES.md`](OBSERVABILITY-BASELINES.md) §4 exactly. The
window is a rolling 28 days unless stated. The **signal** is where the live number is
read from; the **on breach** column is the §4b policy.

| SLO (`id`) | Target | Window | Signal | On breach |
|---|---|---|---|---|
| `availability.uptime` | ≥ 99.9% | 28d | Vercel + uptime monitor | page |
| `latency.read-hot-paths` | p95 < 800 ms | 28d | Sentry perf / Vercel Analytics | track |
| `latency.practice-log-write` | p95 < 1000 ms | 28d | Sentry perf | track |
| `error-rate.requests` | < 0.5% | 28d | Sentry (H0-4) | page |
| `freshness.queue-lag` | < 10 min | live | worker log + heartbeat | page |
| `freshness.cron` | 100% of jobs fresh | per-job | cron heartbeat (H0-5) | page |

Each row carries a one-line `rationale` in the module; the full reasoning lives in
`OBSERVABILITY-BASELINES.md` §4 and is summarised there as "achievable-but-honest for the
current single-region beta scale, tightened as the foundation hardens."

---

## 3. Cron freshness windows (§4a)

Cron freshness is **per-job** because the schedules differ widely. A job is **fresh**
when its last success heartbeat (H0-5) arrived within `schedule interval + 1 interval`
of grace. `CRON_FRESHNESS` in the module groups all 18 `vercel.json` jobs by the urgency
of their silence; `isCronFresh(job, lastSuccessMs)` answers the question for one job.

| Group | Fresh-by | Jobs | Why silence is dangerous |
|---|---|---|---|
| every 2 min | 4 min | `process-queue` | email + async work backlog (H4-2) |
| every 5 min | 10 min | `publish-scheduled` | scheduled content goes live on time |
| every 10 min | 20 min | `season-go-live`, `embed-room-messages` | season transitions; economy integrity |
| every 15 min | 30 min | `nurture`, `event-reminders` | re-engagement + event attendance |
| every 30 min | 60 min | `referral-release`, `embed-events` | referral payouts + search freshness |
| daily / weekly | 1 day + 1h | 10 nightly/weekly jobs (digest, retention, embeddings, …) | digest delivery, retention, embeddings |

> The 18-job schedule list in [`vercel.json`](../vercel.json) is the source of truth for
> *when* jobs run; this table is the **freshness contract** the heartbeat monitor pages
> against. `slos.test.ts` asserts every `vercel.json` job appears here exactly once, so a
> newly-added cron without a freshness window fails the test rather than going unwatched.

---

## 4. Using the module

```ts
import { getSlo, meetsSlo, isCronFresh } from '@/lib/observability/slos'

// Check a measured p95 against its SLO (direction-aware: lower-is-better here).
const readLatency = getSlo('latency.read-hot-paths')!
const ok = meetsSlo(readLatency, measuredP95Ms) // true when p95 <= 800

// Check whether a cron job is fresh given its last success time (H0-5 heartbeat).
const fresh = isCronFresh('process-queue', lastSuccessEpochMs) // false if > 4 min old
```

`meetsSlo` returns `false` for a missing (non-finite) measurement — a missing signal is
never a pass. `isCronFresh` returns `false` for an unknown job or one that has never
succeeded, so a gap surfaces rather than reads as healthy.

---

## 5. When an SLO is breached (§4b)

- **Page (immediate):** `availability.uptime`, `error-rate.requests`, `freshness.cron`
  (any stale job), `freshness.queue-lag` over budget. These have a wired signal and a
  human is expected to respond.
- **Track (review):** the two `latency.*` SLOs. A single slow window is noise; a
  sustained p95 over target opens an H3 investigation against the relevant
  `OBSERVABILITY-BASELINES.md` §2c query plan.
- **The contract:** an H3 change is "done" for a path only when its p95 is back under the
  SLO *and* the re-captured §2c plan shows the structural fix. Beating the SLO without
  fixing the plan is a regression waiting for the next data-size doubling.

---

## 6. Keeping the doc and code in step

When you change an SLO target or add a cron job:

1. Edit `lib/observability/slos.ts` (the executable source of truth).
2. Update `OBSERVABILITY-BASELINES.md` §4 / §4a and this doc's tables to match.
3. Run the tests — `slos.test.ts` will fail if a cron job is unmapped or an id is
   malformed, which is the guard against silent drift.
