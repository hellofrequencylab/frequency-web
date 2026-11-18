#!/usr/bin/env node
// The open rows from the 2026-11-18 email and messaging check (EMAIL-070..EMAIL-075). One probe, one check per row:
//   node scripts/probes/email-scan-2026-11-18.mjs <check>
// Each check reads the tree for the consequence the row fixes and exits 1 until it lands.
import { readFileSync, readdirSync } from 'node:fs'
const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const checks = {
  // EMAIL-070: Resend can accept a send and fail it later for quota; the webhook must put a transactional one back.
  'quota-failed-requeue': () => read('app/api/webhooks/resend/route.ts').includes('reached_daily_quota'),
  // EMAIL-071: the database refuses a direct message between two blocked members, not only the server action.
  'dm-rls-block': () => readdirSync('supabase/migrations').some((f) => {
    const s = read(`supabase/migrations/${f}`)
    return /policy[\s\S]{0,200}on\s+(public\.)?messages\b[\s\S]{0,800}is_blocked_between/i.test(s)
  }),
  // EMAIL-072: a leader's note to every member of their Circles carries a one-click unsubscribe and honors blocks.
  'leader-send-unsubscribe': () => { const s = read('lib/comms/leader-send.ts'); return s.includes('listUnsubscribeHeaders(') && s.includes('isBlockedBetween(') },
  // EMAIL-073: Message Member to many contacts is a bulk send and carries List-Unsubscribe.
  'space-message-member-bulk': () => read('lib/spaces/email-drafts.ts').includes('listUnsubscribeHeaders('),
  // EMAIL-074: a reply notice to a leader or a Space owner opens their own inbox, not the staff-only admin page.
  'reply-bell-destination': () => /lead\/inbox/.test(read('lib/comms/inbound.ts') + read('lib/notifications/href.ts')),
  // EMAIL-075: draft reminders go to the newest draft per address and stop once that person has a Space.
  'draft-reminder-per-address': () => /per.?address/i.test(read('lib/create-space/draft-recovery-io.ts')),
}
const name = process.argv[2]
if (!checks[name]) { console.error(`unknown check: ${name}. One of: ${Object.keys(checks).join(', ')}`); process.exit(79) }
if (!checks[name]()) { console.error(`${name}: not yet`); process.exit(1) }
console.log(`ok: ${name}`)
