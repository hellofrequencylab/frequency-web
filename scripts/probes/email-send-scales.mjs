// EMAIL-045: a campaign of 10,000+ must send end to end with nobody pressing anything. Each reading
// below is a way the 585 person launch send (2026-11-12) died, so it fails on a tree that still has it.
// The behaviour itself is exercised by lib/email-studio/send-scale.test.ts in the normal suite.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')
const send = read('lib/email-studio/send.ts')
const cron = read('lib/spaces/campaigns-send-due.ts')
const outbox = read('lib/queue/outbox.ts')
const queueRoute = read('app/api/cron/process-queue/route.ts')
const audiences = read('lib/studio/campaigns.ts')

// 1. The fan-out queues a chunk in one insert; the per-recipient enqueue inside the loop is the 1/sec ceiling.
const fanOut = send.slice(send.indexOf('export async function sendCampaignNow('), send.indexOf('// ── Quiet-member re-engagement'))
assert.ok(fanOut.includes('enqueueEmailBatch('), 'sendCampaignNow must queue each chunk with enqueueEmailBatch')
assert.ok(!/await enqueueEmail\(/.test(fanOut), 'sendCampaignNow must not queue one recipient at a time')
// 2. It watches a clock and hands the rest to the next run instead of running into the platform limit.
assert.ok(fanOut.includes('options.exhausted'), 'sendCampaignNow must stop at a chunk boundary when its clock is spent')
assert.ok(fanOut.includes("status: 'scheduled'"), 'a handed-off send must go back to scheduled for the next cron run')
// 3. The cron resumes a stranded global send instead of logging and skipping it.
assert.ok(!cron.includes('global_sending_stale'), 'the cron must resume a stale global sending row, not skip it')
// 4. Audiences larger than PostgREST\'s 1,000 row response are read in full.
assert.ok(audiences.includes('readAllPages'), 'resolveSegment must page its audience reads')
// 5. Delivery keeps up: the drain works for a time budget and bulk jobs fall due at a rate it can clear.
assert.ok(queueRoute.includes('processQueueFor'), 'the queue drain must claim batches until its clock is spent')
const rate = Number(/export const BULK_DUE_RATE_PER_MIN = (\d+)/.exec(outbox)?.[1])
assert.ok(rate >= 60 && rate <= 120, `bulk due rate ${rate}/min must clear 10,000 in a few hours and stay inside the provider rate limit`)
console.log('Campaign sends are chunked, time-budgeted, resumable, fully paged and drained fast enough for 10,000+.')
