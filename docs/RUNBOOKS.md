# Incident runbooks

> The page you open at 03:00. Seven failure modes, one section each, and every section answers the
> same questions in the same order: what says it is happening, what to open first, the repair, who
> does each step, and how you know it is over. Technical doc, in git, per
> [`DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md). It serves the SLO table in
> [`OBSERVABILITY-BASELINES.md`](OBSERVABILITY-BASELINES.md) section 4 (the executable copy is
> `lib/observability/slos.ts`). Filed under HYG-131 ([ADR-1561](DECISIONS.md)).
>
> **This page records no status.** No checkboxes, no done marks, no readings. What an incident
> taught goes into an ADR in [`DECISIONS.md`](DECISIONS.md) or a row in
> [`BUILD-BACKLOG.json`](BUILD-BACKLOG.json); what to open next time goes here. The one exception is
> the dated facts table in section 7: the backup configuration and the one rehearsal's timings are
> what a restore decision is made from, in the hour it is made, so they live beside the procedure
> (OWN-082, [ADR-1625](DECISIONS.md)). Re-read them when the plan changes.

## How to use this page

**Two rules before any section.**

1. **Run the control before theorising** ([`DEPLOY-SAFETY.md`](DEPLOY-SAFETY.md) rule 3). Re-run the
   thing that used to work (redeploy the last good commit, re-run the failed preview build, run the
   cron once by hand). Three minutes of control excludes more than two hours of theory.
2. **A fail-safe that fired is invisible.** Every recorder in this repo is a safe no-op when its
   variable is missing. `curl https://frequencylocal.com/api/status | jq .monitoring` answers
   whether Sentry, push and the rate limiter are armed on the build that is serving, and
   `.build.commit` says which commit that is (`app/api/status/route.ts`). Read it first; a quiet
   Sentry can mean a healthy site or a disarmed recorder.

**Who does what.** Half of these steps are dashboard actions. Each step is tagged:

| Tag | Means |
|---|---|
| **agent** | a repo session can do it: read the tree, query read-only through the Supabase MCP, read Vercel logs and deployments through the Vercel MCP, open a PR |
| **owner** | needs an account only the owner holds: Vercel environment variables and rollback buttons, the Supabase billing and backup pages, the Stripe, Resend, Healthchecks and Anthropic dashboards |

**What pages today, and what does not.** Be honest with yourself about which column you are in:

| Failure mode | Pages a human today | Signal that exists but pages nobody |
|---|---|---|
| Cron failure | Healthchecks check for the 20 monitored jobs | `cron.run` lines for the other 9 |
| Queue backlog | Sentry `error` capture tagged `cron_job: process-queue`, and the `process-queue` Healthchecks check fail-pinged, both on the first drain after a dead-letter appears or the oldest due job passes 10 minutes (LIVE-547) | `queue.health` lines every drain, the Deliverability widget, `[outbox]` log lines |
| Webhook failure | Stripe's own failed-delivery email, after its retries | `[stripe-webhook]` log lines, Sentry group |
| Database degradation | Sentry error-rate alert, if armed | weekly `db-usage` reading, red preview builds |
| AI outage | nothing, by design | `ai_usage` going quiet, a feature pinned at its cap |
| Deploy rollback | Vercel deploy-failed email; Sentry new-issue alert | `/api/status` `build.commit` |
| Restore from backup | nothing: no signal detects a bad write, a dropped table or a deleted file | a member or the owner noticing; the Backups page lists what exists |

---

## 1. Cron failure

**Serves** the `freshness.cron` row (any stale job pages) and the per-job windows in
[`OBSERVABILITY-BASELINES.md`](OBSERVABILITY-BASELINES.md) section 4a. `vercel.json` schedules 29
jobs; `lib/observability/slos.ts` `CRON_FRESHNESS` names the windows; LIVE-548 makes the monitored
set a fact in the repo rather than a list of check names in an account.

**What says it is happening.**

- **Healthchecks.io pages** (the only pager). Twenty checks exist, one per job in OWN-005's ranked
  top twenty, each named by the job's route segment (`process-queue`, `season-go-live`, ...) with a
  period set from its real schedule. A check goes down when a success ping misses period plus grace,
  or when the wrapper posts to `/fail` after a 5xx (`lib/observability/cron-heartbeat.ts`).
- **The other nine jobs cannot page.** Their death is visible only in Vercel runtime logs: a
  `cron.run` line with `ok:false`, or no `cron.run` line at all for the job.
- **Sentry**, when armed: a handler that throws is captured with tag `cron_job:<name>`.
- **`cron.heartbeat.ping_failed`** in the logs means the *monitor* rejected the ping, not that the
  cron failed. For a monitored job that is a broken instrument (OWN-065, OWN-070: a deleted or
  renamed check, a rotated ping key). For a job on `CRON_HEARTBEAT_SKIP` it should not appear at all
  (OWN-068).
- **`cron.over_budget`** means the job is running out of its window, not that it is dead
  (`lib/cron/budget.ts`, `DEFAULT_CRON_BUDGET_MS` in the heartbeat module). Read it as the early sign
  of the next failure.

**What to open first.**

1. **agent** Vercel runtime logs for the project, filtered to `cron.run` and the job name: is it
   being invoked, what status does it return, how long does it take. The Vercel MCP `get_runtime_logs`
   reaches the same logs the dashboard shows.
2. **agent** `vercel.json` for the schedule, `app/api/cron` for the route, `lib/cron-auth.ts` for
   the 401 rule (fail closed when `CRON_SECRET` is unset in production).
3. **agent** `pnpm check:cron-freshness` (`scripts/cron-freshness.mjs`): every job has a route,
   is wrapped under its own name, and has a fresh-by window. It cannot see the monitor account.
4. **agent** `lib/observability/cron-heartbeat.ts` for how a ping URL resolves
   (`CRON_HEARTBEAT_URL_<SLUG>`, then `CRON_HEARTBEAT_BASE_URL/<job>`, skip list first).
5. **owner** The Healthchecks dashboard: which check is down, and when the last ping arrived.

**The repair**, by what the logs show.

- **Runs and returns 500.** Read the error on the `cron.run` line or in Sentry. Fix the route in a
  PR. Nothing to replay by hand: every cron here claims or stamps its rows and resumes where it
  stopped, so the next scheduled run picks up the tail. **agent**
- **Not invoked at all.** Crons run only on the current production deployment. If the last
  production deploy failed, the previous deployment's crons are still running; if the project's
  cron settings were changed, they are not. Check the deployment list (section 6) and the Cron Jobs
  page in Vercel project settings. **owner** for settings, **agent** to read.
- **Returns 401.** `CRON_SECRET` is missing or was rotated in Vercel without a redeploy. Set it and
  redeploy. **owner**
- **Pings rejected (`ping_failed` with 404) for a monitored job.** Recreate the check in
  Healthchecks with the job name as its slug and the period from `vercel.json`. **owner**
- **Run it once by hand** to confirm a fix before the next tick:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://frequencylocal.com/api/cron/<job>`.
  **owner** holds the secret; the response body is the route's own counts line.

**How you know it is over.** The Healthchecks check is up with two consecutive green pings at its
period; `cron.run` shows `ok:true` with `over_budget:false`; and if wiring changed,
`pnpm check:cron-freshness` is clean. Record any new rule as a row, not here.

---

## 2. Queue backlog

**Serves** the `freshness.queue-lag` row (10 minutes, page). `app/api/cron/process-queue/route.ts`
computes it after every drain through `queueHealth()` in `lib/queue/outbox.ts`: the lag is the minutes
the oldest DUE pending job has waited past its `run_after` (a job parked by backoff or a closed quota
is waiting by design, not lag). The threshold is read from `lib/observability/slos.ts`
(`getSlo('freshness.queue-lag')`), never a literal in the cron (LIVE-547, ADR-1571).

**What says it is happening.**

- **What pages.** On the first drain after a dead-letter appears, the oldest due job passes the
  10-minute target, or the health read itself fails, `process-queue` captures a Sentry message at
  `error` level (`[process-queue] queue health breached: ...`, tagged `cron_job: process-queue`, the
  three numbers in `extra`, one issue per breach kind) and sets `x-cron-slo-breach` on its 200, which
  `lib/observability/cron-heartbeat.ts` turns into a `/fail` ping on the `process-queue` Healthchecks
  check. The check stays down while the breach lasts and comes back up on the first clean drain. The
  drain itself is never failed for it, so a paged run still reports what it processed.
- **The reading**, every two minutes whatever the outcome: one `queue.health` line in the Vercel logs
  with `pending`, `dead_lettered`, `lag_min`, `oldest_due_age_min`, `measured` and `breach`, and a
  `cron.slo_breach` warn line from the wrapper on a breached run.
- **The Deliverability page** at `/admin/marketing/deliverability`
  (`app/(main)/admin/marketing/deliverability/page.tsx`, marketing staff). The Queue health block
  (`components/widgets/marketing/deliverability-health.tsx`) shows Pending in queue, Dead-lettered
  and Oldest due job waiting, the same `queueHealth()` reading the cron pages on; the dead-letter block (`components/widgets/marketing/deliverability-dead-letters.tsx`)
  lists the parked jobs with their last error.
- **Vercel logs** from `app/api/cron/process-queue/route.ts` and `lib/queue/outbox.ts`:
  `[process-queue] N job(s) dead-lettered this drain`, `[outbox] dead-lettered job ...`,
  `[outbox] deferring job ... (daily_quota)`, `[outbox] retrying job ...`,
  `[outbox] claim RPC failed`.
- **Symptoms members report first:** no welcome email, no event reminder, no push. The queue is the
  async lane for all three (`lib/queue/handlers.ts` lists the kinds).
- **The `process-queue` Healthchecks check down** is section 1, not this one; come back here once
  the drain runs again.

**What to open first.**

1. **agent** The `queue.health` line from the latest drain, or the Deliverability page, or the same
   numbers read-only through the Supabase MCP:
   `select status, kind, count(*), min(created_at), min(run_after) filter (where run_after <= now()) from notification_queue where status in ('pending','processing','failed') group by 1, 2 order by 1, 2;`
   `now() - min(run_after)` over the due pending rows is the queue lag the SLO is judged on;
   `min(created_at)` says how old the backlog is.
2. **agent** `lib/queue/outbox.ts`: the retry policy (`nextRetry`, `retryDelayFor`), the two lanes
   (`transactional` first, `bulk` paced at `BULK_DUE_RATE_PER_MIN`), the terminal states
   (`DEAD_LETTER_STATUS` is `failed`, `DISCARDED_STATUS` is `discarded`), and the header on the
   2026-07-17 quota incident that shaped all of it.
3. **agent** `supabase/migrations/20261001000000_claim_outbox_jobs.sql`: the claim RPC flips rows to
   `processing` under `SKIP LOCKED` and reclaims anything stuck in `processing` for over five
   minutes on its own.
4. **owner** The provider: the Resend dashboard for quota and bounces (`lib/email.ts` reads
   `RESEND_API_KEY`), and `/api/status` `monitoring.push` for whether push can leave the process at
   all (`lib/push.ts`).

**The repair**, by shape.

- **Pending grows, no dead letters, `deferring ... daily_quota` lines.** The window is shut, not
  broken. A daily quota defers to the next UTC midnight without spending an attempt, for up to 72
  hours. Do not requeue anything; nothing is dead. If the quota is the plan, raise the plan.
  **owner** for the plan, **agent** to confirm the shape.
- **Pending grows and the drain is not running.** Section 1 for `process-queue`. To move the
  backlog now, the Drain queue button on the Deliverability page
  (`app/(main)/admin/marketing/deliverability/requeue-button.tsx`) runs one bounded drain with the
  same handlers as the cron. **agent** with marketing staff access, else **owner**.
- **`claim RPC failed`.** That is the database. Section 4.
- **Dead letters present.** Read `last_error` on the rows. Fix the cause first (a provider key, a
  handler bug, a bad payload), then Requeue from the page, all or one `kind`
  (`app/(main)/admin/marketing/deliverability/actions.ts` calls `requeueDeadLettered`, 500 per
  click, attempts reset). Requeueing before the cause is fixed spends the attempts again and lands
  them back here. If the payload is no longer wanted (a stale campaign, a reminder for an event that
  already happened), Discard instead: `discardDeadLettered` marks the rows `discarded` and never
  deletes. **agent**
- **Rows stuck in `processing`.** The claim RPC reclaims them after five minutes. Only act if the
  count never falls, which means the drain is not running (section 1).

**How you know it is over.** Pending returns to zero, or to the paced bulk rate while a campaign
sends; the oldest pending row is under ten minutes old; Dead-lettered is zero or every remaining row
is `discarded` on purpose; and three consecutive drains (six minutes) log no new dead letter.

---

## 3. Webhook failure

**Serves** the `error-rate.requests` row (page) and, more than any SLO, the money rows: a missed
Stripe event is a member who paid and did not get what they paid for. The contract for the routes is
[`CHECKOUT.md`](CHECKOUT.md).

**What says it is happening.**

- **Stripe's dashboard** (Developers, Webhooks, the destination) lists failed deliveries per event
  and emails the account owner once retries have failed for a while. Stripe retries a non-2xx with
  backoff for up to three days, so a short outage heals itself; a wrong secret does not.
- **Vercel logs** from `app/api/webhooks/stripe/route.ts`: `[stripe-webhook] handler failed
  (type=..., id=...)`, `[stripe-webhook] idempotency claim failed`, a 400 `invalid signature`, or a
  503 `billing not configured`. Sentry, when armed, groups the same errors under the route.
- **The claim ledger** `stripe_webhook_events`
  (`supabase/migrations/20260608120000_stripe_webhook_events.sql`), one row per event id. Read it
  against Stripe's delivery list:

  | Stripe says | Row present | Meaning |
  |---|---|---|
  | failed | no | never claimed; the next retry processes it |
  | failed | yes | claimed and the response was lost; check whether the effect landed before replaying |
  | 200 | yes, no effect | acked, and a recorder no-op'd (wrong `metadata.kind`, `payment_status` unpaid); a replay dedupes as `duplicate` |
  | 200 `duplicate: true` | yes | a retry of an event already handled; nothing to do |

- **Symptom:** a member's `membership_tier`, ticket, order or Space plan did not change after a
  successful checkout.
- **Resend** delivers the same way with the same claim pattern (`email_webhook_events` in
  `app/api/webhooks/resend/route.ts`, secret `RESEND_WEBHOOK_SECRET`); a failure there under-counts
  opens and bounces, never money.

**What to open first.**

1. **owner** The event page in Stripe: the response body Stripe recorded is the route's own error
   message.
2. **agent** `app/api/webhooks/stripe/route.ts`: the event switch, the claim before handling, and the
   release on failure. `lib/billing/stripe.ts` for `STRIPE_WEBHOOK_SECRETS`: two signing secrets,
   `STRIPE_WEBHOOK_SECRET` for the platform destination and `STRIPE_CONNECT_WEBHOOK_SECRET` for the
   Connect one, and a signature that matches either is accepted.
3. **agent** The recorder for the kind: `lib/billing/tickets.ts`, `lib/commerce/checkout.ts`,
   `lib/billing/space-subscriptions.ts`, `lib/billing/tips.ts`, `lib/billing/checkout.ts`. Each is
   idempotent on its session or charge id, which is what makes a replay safe.

**The repair**, by response.

- **400 `invalid signature` on every event.** The destination's `whsec_` no longer matches the
  variable in Vercel (a rotated secret, or a new destination). Copy the signing secret into
  `STRIPE_WEBHOOK_SECRET` or `STRIPE_CONNECT_WEBHOOK_SECRET`, redeploy, then Resend each failed
  event from Stripe: none was claimed. **owner**
- **503 `billing not configured`.** The Stripe key or both secrets are absent in that environment.
  Stripe keeps retrying, so set the variables and let it. **owner**
- **500 `processing failed`.** The claim was released, so Stripe's retry will re-process. If the
  error is the database, section 4 and wait. If it is a bug, fix it in a PR, merge, then Resend the
  event from Stripe once the fix is live. **agent** for the fix, **owner** for the replay.
- **500 `claim failed`.** The insert into `stripe_webhook_events` failed for a reason other than a
  duplicate. That is the database; section 4.
- **Acked 200 with no effect.** Do not simply replay: it dedupes. Read why the recorder no-op'd. If
  the event genuinely should apply, delete its claim row (`delete from stripe_webhook_events where
  event_id = 'evt_...'`, one id, through the Supabase MCP) and then Resend from Stripe. **agent** for
  the row with the id in hand, **owner** for the replay.

**How you know it is over.** The destination's recent deliveries are all 2xx, every failed event
shows a later successful attempt, and the member-facing row reads what Stripe says. For a run of
missed events, one query over `stripe_webhook_events` for the affected window against Stripe's
event list, and the difference is empty.

---

## 4. Database degradation

**Serves** `availability.uptime` and `error-rate.requests` (both page). Every other row reads
through the database, so this section is also the fallback for a queue that cannot claim, a webhook
that cannot claim, and a cron that 500s on its first query.

**What says it is happening.**

- **The status read is not the signal.** On 2026-09-15 the control plane reported the project
  `ACTIVE_HEALTHY` for the whole eighteen minutes in which every query failed (LIVE-336). Do not
  stop at a green project status.
- **Signals that move:** a Sentry error spike across unrelated routes in the same minute; every
  preview build going red at once (a menu read that fails during `next build` fails the build on
  purpose, so a red board on unrelated PRs is a database event, not five bugs); `[outbox] claim RPC
  failed`; `[stripe-webhook] ... claim failed`; a `select 1` through the Supabase MCP that hangs or
  errors.
- **The weekly reading:** the Database account usage step of `.github/workflows/maintenance.yml`
  runs `scripts/maintenance/db-usage.mjs` and writes connections against `max_connections` (75%
  warn, 90% critical), request volume and size into the tracking issue titled "Weekly maintenance
  sweep". It is a trend, not a pager, and it says "Could not look" rather than "fine" when the token
  is gone.
- **Not this section:** `check:migrations` failing with HTTP 401 is the `SUPABASE_ACCESS_TOKEN`
  expiring or being refused, not the database (LIVE-273; the current token, rotated 2026-09-30,
  expires 2027-09-28).

**What to open first.**

1. **owner** (or **agent** through the Supabase MCP `query_logs` and `get_advisors`) The project
   `azsqfeonabsbmemvddqd` in the Supabase dashboard: Reports for connections, CPU and disk IO; Logs
   for Postgres and PostgREST.
2. **agent** `node scripts/maintenance/db-usage.mjs --print-query` prints the read-only SQL the
   sweep runs; run it through `execute_sql` and read connections and the postmaster start time (a
   recent start is a restart you did not order).
3. **agent** `lib/supabase/env.ts`: the three variables every client reads, and the error that names
   the missing one. A blank value in Vercel is a missing value.
4. **agent** [`WORKFLOW.md`](WORKFLOW.md): local, preview and production are one Supabase project.
   Nothing you do here is isolated.

**The repair**, by cause.

- **Account ceiling or plan limit** (the 2026-09-15 shape). The database is fine and the account is
  refusing. Raise the plan or clear the limit in the Supabase org billing page. **owner** While
  waiting, stop the load that is ours: cancel queued preview builds and pause the build loop, whose
  own reads were measured at 1,200 to 2,900 per table per fifteen minutes (ADR-1328). **agent**
- **Connections exhausted.** `select usename, application_name, state, count(*) from
  pg_stat_activity group by 1, 2, 3 order by 4 desc;` names the source. A runaway cron gets disabled
  in Vercel cron settings or by a hotfix PR; a restart of the project (Settings, General, Restart
  project) is the last resort and drops every live connection. **agent** to find, **owner** to
  restart.
- **Slow queries or CPU.** The Supabase Query Performance report and `get_advisors` for performance
  name the statement. An index is a file in `supabase/migrations/` in a PR, never a hand-applied fix
  under pressure ([`WORKFLOW.md`](WORKFLOW.md), the one shared database). To prove the fix holds
  under load, run `scripts/load-soak.mjs` against the fix's preview after the incident, never during
  it: a preview reads the same database, so load on it is load on the one that is already degraded
  ([`OBSERVABILITY-BASELINES.md`](OBSERVABILITY-BASELINES.md) section 2d). **agent**
- **Credentials.** The error names the variable (`lib/supabase/env.ts`). Set it in Vercel and
  redeploy. **owner**
- **Data loss, or a restore is on the table.** Go to section 7. Owner only, announced first. In
  short (read 2026-09-29): daily physical backups, about 7 days kept, **no point-in-time recovery**,
  so up to 24 hours of writes can be lost (RPO); the database comes back in about 12 minutes as a
  new project (RTO, measured), and the whole site takes longer than that, unmeasured. **Uploaded
  files have no backup at all.** Do not promise a member anything shorter than a day.

**How you know it is over.** A failed preview build re-run goes green (the control); `select 1`
answers; the Sentry rate is back under 0.5% and the group has stopped; the outbox drains (section 2
symptoms clear); and the next weekly reading shows headroom. Write the cause into the LIVE row for
the incident, not here.

---

## 5. AI outage

**Serves** no SLO row directly. Every AI surface is built to degrade to deterministic behaviour
([`AI-CONTROLS.md`](AI-CONTROLS.md)), so the thing to verify in an outage is that the fallbacks held,
and the thing to repair is whatever stops them coming back.

**What says it is happening.**

- **Nothing pages, by design.** `lib/ai/complete.ts` throws `AiUnavailableError` when no client is
  configured and every caller catches it: help search deflects to links and a human
  (`lib/ai/help-rag.ts`), a Vera turn streams an error line and the concierge falls back
  (`app/api/vera/turn/route.ts`, `lib/ai/vera/concierge.ts`), the sweep's AI triage step ships the
  deterministic report without it (`scripts/maintenance/sweep.mts`).
- **The Vera ledger goes quiet.** Every call writes an `ai_usage` row (`lib/ai/usage.ts`
  `recordAiUsage`). A weekday with no rows, or a feature pinned at its cap, is the reading:
  `select feature, count(*), sum(cost_usd) from ai_usage where created_at > now() - interval '24 hours' group by 1 order by 3 desc;`
- **The AI controls tab** at `/admin/vera-ai` (`components/admin/vera-ai/ai-controls-tab.tsx`,
  data from `app/(main)/admin/ai/load-ai.ts`): master switch state, whether the key is present,
  today's spend per feature against its daily cap, and the switch history.
- **Sentry**, when armed: Anthropic SDK errors on the AI routes. 401 is the key, 429 is a rate limit,
  529 is the provider overloaded, 404 on a model id is a retired model.
- **A feature at its cap** pauses itself for the UTC day (`lib/ai/budget.ts`,
  `FEATURE_DAILY_CAP_USD` per feature and `GLOBAL_DAILY_CAP_USD` across all of them). That is the
  cap working, not an outage.

**What to open first.**

1. **agent** The `ai_usage` query above, then the AI controls tab.
2. **agent** `lib/ai/client.ts`: `aiEnabled()` is the key present and `AI_DISABLED` not `1`;
   `AI_GATEWAY_URL` swaps the transport. `lib/ai/usage.ts`: `aiAvailable()` layers the
   `platform_flags.ai_enabled` switch on top and fails closed on any read error.
3. **agent** `lib/ai/models.ts`: the three model ids and their prices. A tier and its price move
   together (LIVE-194).
4. **owner** The Anthropic status page and console: usage, limits, key state.

**The repair**, by cause.

- **Provider outage (529, 5xx, timeouts).** Nothing to fix here. Confirm the fallbacks are holding
  by opening help search and a Vera turn as a member. If members are waiting on timeouts rather than
  seeing the deterministic path, flip the master switch OFF on the controls tab so every surface
  takes the fallback immediately; the flip is audited in `platform_flag_events`
  (`lib/platform-flags.ts`). Flip it back ON when the status page clears. **agent** with janitor
  access, else **owner**.
- **401.** Rotate `ANTHROPIC_API_KEY` in the Anthropic console and in Vercel, redeploy. **owner**
- **A cap tripped.** Expected. Read what spent it. A legitimate day raises the cap in a PR to
  `lib/ai/budget.ts`; a runaway is exactly what the cap is for and stays paused.
- **Vera autonomous sends stopped.** The circuit breaker (`lib/ai/vera/circuit-breaker.ts`)
  disarms on a bounce or complaint anomaly and stays disarmed until a human re-arms it on the
  controls tab. Read the audit reason before re-arming. **owner**
- **Model retired.** Re-point the tier in `lib/ai/models.ts` and update its price in the same
  change. **agent**

**How you know it is over.** A fresh `ai_usage` row for the affected feature inside the hour, the
controls tab shows spend moving and no feature at cap, the Sentry AI groups are quiet, and the master
switch is ON with a switch-history entry that explains the off period.

---

## 6. Deploy rollback

**Serves** `availability.uptime` and `error-rate.requests` (both page). The rules are in
[`DEPLOY-SAFETY.md`](DEPLOY-SAFETY.md); this is the order to apply them in when production is wrong
right now. A merge to `main` is a deploy.

**What says it is happening.**

- **The Vercel deployment list:** the newest production deployment is `ERROR` or `CANCELED` (the
  previous one keeps serving), or it is `READY` and serving something broken.
- **`/api/status`** `build.commit` says which commit is live. "I merged it" is not evidence
  (`app/api/status/route.ts`).
- **Sentry**, when armed, opens a new issue tagged with the release, which is the commit SHA.
- **A `postbuild` gate failed the build:** `check:build-budget`, `check:og-trace`,
  `check:cache-budget`, `check:shell-weight`, `check:build-fanout`, `check:notfound-routes`. The gate
  prints the fan-out that tripped it. That build did not ship, which is the gate working.

**What to open first.**

1. **agent** The deployment list and the failing deployment's build log (Vercel MCP
   `list_deployments`, `get_deployment`, `list_deployment_events`). Save the log and run
   `pnpm read:build-log <file>` (`scripts/read-build-log.mjs`): it prints the phases, the cache
   lineage and the gate readings so nobody subtracts timestamps by hand.
2. **agent** [`DEPLOY-SAFETY.md`](DEPLOY-SAFETY.md) rules 3 (control first), 4 (let it finish), 9
   (a font 404 gets redeployed before it gets debugged).
3. **agent** The merge commit on `main` and its PR, for what changed.

**The repair**, in this order.

1. **Let the failing build finish.** Cancelling destroys the log that answers the question. **owner**
   (do nothing).
2. **Run the control.** Redeploy the byte-identical commit from the Vercel deployment menu. If it
   goes green, the platform hiccuped (the 2026-08-12 font class) and you are done. **owner**, or
   **agent** through `create_deployment` on the same SHA.
3. **If a broken deployment is READY and serving:** Instant Rollback. In Vercel, open the last good
   production deployment and promote it (the Vercel MCP `request_rollback` and `request_promote`
   do the same). It moves the alias in seconds with no build. Then confirm `/api/status`
   `build.commit` is the old SHA. **owner**, or **agent** with the tool.
4. **Bring `main` back in line.** A `git revert` of the merge commit, in a PR, squash auto-merged,
   so the next merge does not redeploy the break. Never leave `main` ahead of production silently:
   crons and webhooks run whatever is deployed. **agent**
5. **Check the database is not ahead of the code.** A reverted PR that carried a migration leaves
   the column applied and the old code reading around it. Do not roll a migration back; make the
   reverted code tolerate the schema, and read `scripts/check-migrations.mjs` output on the revert
   PR. **agent**
6. **If it was a size gate:** fix the fan-out the gate printed, never the budget (rule 2). **agent**

**How you know it is over.** The production deployment is `READY`, `/api/status` `build.commit` is
the SHA you expect, the Sentry group has stopped, the next real deploy prints all six gates green,
and the cause is an ADR in [`DECISIONS.md`](DECISIONS.md) if it taught a rule, or a row if it did
not.

---

## 7. Restore from backup

**Serves** no SLO row. This is the section for a bad write, a dropped table, a migration that
destroyed data, or a project that is gone. Section 4 is for a database that is slow or refusing;
come here only when the data itself is wrong or missing. Owner only, and announced first: the
database is the whole product, and local, preview and production are one Supabase project
([`WORKFLOW.md`](WORKFLOW.md)). Decided in [ADR-1625](DECISIONS.md) under OWN-082.

**The facts, read 2026-09-29** from the owner's dashboard screenshots (Database, Backups) and timed
in one rehearsal the same day, with the restored copy checked by read-only SQL. Re-read them when the
plan or an add-on changes.

| Fact | Value | How it was read |
|---|---|---|
| Project | Frequency Community, `azsqfeonabsbmemvddqd`, us-west-2, Postgres 17 | dashboard |
| Plan | Pro (organisation) | dashboard, billing |
| Backup tier | Scheduled backups, **daily, physical**, taken about 11:45 to 11:51 UTC | Backups page |
| Retention | 8 backups listed (22 to 29 Sep 2026), so about **7 days** | Backups page |
| Point-in-time recovery | **Not enabled** ("available as an add-on"). Owner ruling: daily is enough for now; revisit at 1,000 profiles or when paid orders are regular, whichever is first ([ADR-1625](DECISIONS.md)) | Backups page; ruling 2026-09-29 |
| RPO | **Up to 24 hours.** Shown in the rehearsal: the copy from the 11:48:49 UTC backup held 745 migration ledger rows ending at `20270345009410`; production held 748 ending at `20270345009700`, because 9500, 9600 and 9700 were applied at 16:28 UTC, after the backup | rehearsal, SQL |
| RTO, database | **12 minutes**, click to ready: Restore to new project clicked 18:14 UTC (11:14 PDT), project ready 18:26 UTC | rehearsal, timed |
| RTO, whole site | **Longer than 12 minutes and not measured.** The steps under "Not restored" below are all manual | not rehearsed |
| Storage files | **No backup exists.** "Database backups do not include objects stored via the Storage API." The `storage.objects` rows come back; the files they describe do not | Backups page |
| Cost of a restore | The new project bills at the same compute ($14.83 a month shown) for as long as it exists | restore dialog |

The rehearsal copy ("Frequency Temp", `wfgnxpvxddrzqyykrktn`) matched production where it should,
checked at 18:39 UTC: 60 profiles (equal), newest profile 2026-09-27 16:48 (equal), 526
`storage.objects` rows (equal, metadata only), database 255 MB against production's 261 MB.

**What says it is happening.**

- **Nothing pages.** No signal in this repo detects a bad write, a dropped table or a deleted file.
  It arrives as a member report, an empty page that had content yesterday, or a migration PR whose
  author says "that dropped more than I meant".
- **The migration ledger is the fastest timeline.** `select version, name from
  supabase_migrations.schema_migrations order by version desc limit 10;` says what ran and in what
  order; `scripts/check-migrations.mjs` compares it with `supabase/migrations/`.
- **The Backups page** (Database, Backups, Scheduled backups) lists the backups that exist and when
  each was taken. That list is the menu: the newest backup older than the damage is the one to use.

**What to open first.**

1. **owner** Database, Backups in the Supabase dashboard for project `azsqfeonabsbmemvddqd`. Note
   the time of the newest backup taken before the damage.
2. **agent** The ledger query above, and the merged PRs since that backup, for what the restore
   will undo. Every write after the backup is lost, not only the bad one.
3. **agent** Decide whether a restore is the right tool at all. A few wrong rows are usually a
   forward fix: read the rows out of a restored copy (steps 1 to 4 below, then stop) and write them
   back to production in a reviewed migration or a one-off script. Only a broken or missing project
   justifies moving the site.

**The repair.** Always restore **to a new project**. Never click **Restore** beside a backup in the
Scheduled backups list, during a rehearsal or otherwise: that restores in place and **overwrites
production**, losing every write since that backup with no way back.

1. **owner** Database, Backups, then **Restore to new project**. Pick the backup. Keep the region
   (us-west-2) and the same compute. Read the dialog: it lists what does not come across (below).
   Confirm and note the clock time.
2. **owner** Wait for the new project to report ready. Measured: 12 minutes on 2026-09-29, for a
   261 MB database.
3. **agent** Prove the copy is the backup you meant with read-only SQL on the new project: `select
   count(*) from profiles;`, `select max(created_at) from profiles;`, `select count(*) from
   storage.objects;` and the ledger query above. Compare with production and with the backup time.
4. **agent** List the migrations applied after the backup (in `supabase/migrations/`, not in the
   copy's ledger). They must be re-applied in version order before code that expects them is
   pointed at the copy.
5. **owner** Only if the site is moving to the copy, reconfigure by hand everything the restore does
   not carry:
   - **Vercel environment:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
     `SUPABASE_SERVICE_ROLE_KEY` (the three `lib/supabase/env.ts` reads) set to the new project's URL
     and keys, then redeploy. GitHub's `SUPABASE_PROJECT_REF` variable and `SUPABASE_ACCESS_TOKEN`
     secret for the CI and maintenance reads.
   - **Auth settings and keys:** site URL, redirect URLs, providers, SMTP and email templates. New
     keys mean every member is signed out and signs in again.
   - **Edge Functions:** redeploy `supabase/functions/embed`.
   - **Extensions and database settings** that are not in a migration.
   - **Storage:** bucket settings, and the files themselves, which exist nowhere else. Rows that
     store absolute image URLs name the old project's host or the `api.frequencylocal.com` custom
     domain, so the custom domain has to move to the new project for them to resolve.
   - **Read replicas**, if any are ever added.
6. **owner** After a rehearsal, **delete the new project** the same day (Project Settings, General).
   It bills at production's compute for as long as it exists, and a paid-tier project cannot be
   paused.

**Not restored**, per Supabase's own restore dialog and Backups page: storage objects (the files) and
storage settings; Edge Functions; auth settings and API keys; database extensions and settings; read
replicas. Database backups do not include objects stored via the Storage API, so there is no copy of
an uploaded file anywhere. OWN-084 is the ruling on paying for one.

**Rehearse** once a quarter, the next before launch day (2026-12-21), and again whenever the plan,
the compute size or the point-in-time add-on changes. A rehearsal is steps 1 to 4 and 6 against the
newest backup: about half an hour of the owner's time, and the compute for the hour or so the copy
exists. Write the new timings into the facts table with the date.

**How you know it is over.** The site serves from the project you chose, `/api/status` answers, a
member can sign in, the ledger query shows every migration in `supabase/migrations/` applied, and
the cause is an ADR in [`DECISIONS.md`](DECISIONS.md) or a row. After a rehearsal: the scratch
project is deleted and no longer bills.
