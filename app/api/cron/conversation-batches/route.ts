// LIVE-190 budget (ADR-1252): 1000 queued rows per flush per invocation; the row claim (batches) and last_digested_at (digests) resume the tail.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Conversation batch + digest cron (ADR-812). Two quiet-time passes over the comms_* spine, BOTH dormant
// until their env window is set (default 0 = off), so this cron is a cheap no-op on a stock deployment:
//   - flushConversationBatches: coalesce a burst of queued outbound replies into one email per thread.
//   - flushConversationDigests: roll a recipient's newly-arrived inbound replies into one summary email.
// Runs every 5 minutes; a window of N minutes means a burst/reply is flushed on the first pass after it
// has been quiet for N minutes.

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { flushConversationBatches, flushConversationDigests } from '@/lib/comms/outbound-batch'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(1000)
  const batches = await flushConversationBatches(budget.items)
  const digests = await flushConversationDigests(budget.items)
  const summary = budget.summary(batches.messages + digests.conversations)
  log.info('cron.conversation_batches.counts', {
    ...summary,
    batch_conversations: batches.conversations,
    batch_emails: batches.emails,
    batch_messages: batches.messages,
    digest_recipients: digests.recipients,
    digest_emails: digests.emails,
    digest_conversations: digests.conversations,
  })

  return NextResponse.json({ ok: true, batches, digests, budget: summary })
}

export const GET = withCronHeartbeat('conversation-batches', handler)
