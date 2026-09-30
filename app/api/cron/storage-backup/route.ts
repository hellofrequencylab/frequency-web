// LIVE-190 budget (ADR-1252): 500 storage objects listed per invocation, a 1.5 GiB byte cap and the clock checked before every object; the cursor moves after each copy, so a cut-off run resumes after the last object that landed and says how many are left.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Nightly storage copy (HYG-144, ADR-1693). Runs daily via Vercel Cron.
 *
 * THE GAP IT CLOSES. Supabase's daily backup restores the storage.objects rows and not the files
 * (OWN-082's rehearsal), so a lost bucket was lost. The owner ruled "Nightly copy elsewhere" and
 * picked Cloudflare R2. Each run copies every object, in every bucket, changed since the last one
 * that landed, to R2 under `<bucket>/<path>`. The loop, the cursor and the streaming are in
 * lib/backup/storage-copy.ts; the restore steps are docs/RUNBOOKS.md §7.
 *
 * INERT UNTIL CONFIGURED. Until the owner creates the R2 bucket and token and sets R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BACKUP_BUCKET (OWN-088), a run logs
 * `cron.storage_backup.inert` with the missing names and answers 200 without opening a database
 * connection. A half-set configuration is inert too, and says which half is missing.
 *
 * A FAILED COPY ANSWERS 500, so the heartbeat wrapper fail-pings and `cron.run` reads ok:false. The
 * cursor stays on the last object that landed, so the next run retries the one that failed.
 *
 * WHY THE SERVICE ROLE. The caller is Vercel Cron, so there is no session. The job reads every
 * bucket, the private ones included (only the service role can sign a private object's url), the
 * listing RPC is granted to service_role only, and the cursor is a platform_settings row, a table
 * with no client policies. It writes that one row and nothing else in the database.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget, CRON_TIME_BUDGET_MS } from '@/lib/cron/budget'
import { createAdminClient } from '@/lib/supabase/admin'
import { r2ConfigFromEnv } from '@/lib/backup/r2'
import { runStorageCopy, supabaseToR2Deps } from '@/lib/backup/storage-copy'
import { log, briefError } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A 500 MB recording is one object; give the copy the full cron window.
export const maxDuration = 300

/** Bytes one run copies. The first object is always taken, so a file larger than this still moves. */
const MAX_BYTES_PER_RUN = 1536 * 1024 * 1024

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const r2 = r2ConfigFromEnv()
  if (!r2.config) {
    log.info('cron.storage_backup.inert', { missing: r2.missing })
    return NextResponse.json({ ok: true, inert: true, missing: r2.missing })
  }

  const budget = cronBudget(500)
  try {
    const deps = supabaseToR2Deps(createAdminClient(), r2.config, { exhausted: budget.exhausted })
    const report = await runStorageCopy(deps, { maxItems: budget.items, maxBytes: MAX_BYTES_PER_RUN })
    const summary = budget.summary(report.copied + report.gone, report.more ? null : 0)
    const fields = {
      listed: report.listed,
      copied: report.copied,
      gone: report.gone,
      bytes: report.bytes,
      stopped: report.stopped,
      cursor_at: report.cursor_after?.at ?? null,
      ...summary,
    }
    if (report.stopped === 'error') {
      log.error('cron.storage_backup.failed', { ...fields, error: report.error, failed_key: report.failed_key })
      return NextResponse.json({ ok: false, ...report, budget: summary }, { status: 500 })
    }
    log.info('cron.storage_backup.counts', fields)
    return NextResponse.json({ ok: true, ...report, budget: summary })
  } catch (e) {
    log.error('cron.storage_backup.failed', { error: briefError(e) })
    return NextResponse.json({ error: 'storage backup failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('storage-backup', handler, { budgetMs: CRON_TIME_BUDGET_MS })
