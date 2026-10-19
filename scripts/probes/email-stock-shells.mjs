// EMAIL-027 probe: every stock email built OUTSIDE lib/email.ts wears a shell and has a sample in the
// stock catalog. EMAIL-026's probe reads lib/email.ts; these templates lived in their own modules
// (a lead notice, the promoted seat, the owner brief, the renewal notice, the ticket sale, the tip, the
// shipped order, the automation note) and four of them went out as bare
// fragments with no doctype, wordmark, footer or address line.
//
//   node scripts/probes/email-stock-shells.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')
const catalog = read('lib/email-samples/catalog.ts')

// Module → exported builder → the shell its source must render through.
const STOCK = [
  { file: 'lib/crm/lead-notify.ts', builder: 'buildContactLeadEmail', shell: 'emailShell(' },
  { file: 'lib/events/waitlist-notify.ts', builder: 'promotedSeatHtml', shell: 'emailShell(' },
  { file: 'lib/ai/vera/owner-brief.ts', builder: 'ownerBriefEmailHtml', shell: 'emailShell(' },
  { file: 'lib/billing/renewal-notice-email.ts', builder: 'buildRenewalNoticeEmail', shell: 'emailShell(' },
  { file: 'lib/billing/ticket-sale-notify.ts', builder: 'saleEmailHtml', shell: 'emailShell(' },
  { file: 'lib/billing/tips-notify.ts', builder: 'tipEmailHtml', shell: 'emailShell(' },
  { file: 'lib/commerce/shipped-notice.ts', builder: 'shippedNoticeContent', shell: 'ReceiptContent' },
  { file: 'lib/automations.ts', builder: 'actorEmailMessage', shell: 'plainTextEmail(' },
]
for (const { file, builder, shell } of STOCK) {
  const src = read(file)
  assert.ok(new RegExp(`^export (?:async )?function ${builder}\\(`, 'm').test(src), `${file} does not export ${builder}`)
  assert.ok(src.includes(shell), `${file} does not render through ${shell}`)
  assert.ok(new RegExp(`\\b${builder}\\(`).test(catalog), `lib/email-samples/catalog.ts has no sample for ${builder}`)
}

// The bare fragments are gone: no stock module opens its own 560px div as the email document.
for (const file of ['lib/crm/lead-notify.ts', 'lib/events/waitlist-notify.ts', 'lib/ai/vera/owner-brief.ts']) {
  assert.ok(!/<div style="(?:font-family|max-width:560px)/.test(read(file)), `${file} still ships a bare email fragment`)
}

// The billing cron calls the builder instead of composing HTML inline. (The week-ahead reminder stays in
// the event-reminders cron: SCAN-849 and EMAIL-023 pin it there, and it already wears emailShell.)
const renewals = read('app/api/cron/billing-renewals/route.ts')
assert.ok(renewals.includes('buildRenewalNoticeEmail(') && !renewals.includes('wrapEmailHtml('), 'the billing-renewals cron still builds the renewal email inline')
const fulfilment = read('lib/commerce/fulfilment.ts')
assert.ok(fulfilment.includes('shippedNoticeContent('), 'the fulfilment writer does not use the shipped notice builder')

// The owner brief left the token guard's waiver (a planted hex in it now fails pnpm check:tokens).
const guard = read('scripts/check-tokens.mjs')
assert.ok(!/owner-brief/.test(guard.replace(/\/\/.*$/gm, '')), 'scripts/check-tokens.mjs still waives lib/ai/vera/owner-brief.ts')

// Sender stays whole: the catalog test exempts the owner's account mail from the unsubscribe check by id, never by group.
const test = read('lib/email-samples/catalog.test.ts')
for (const id of ['contact-lead', 'ticket-sale-host', 'tip-received', 'renewal-reminder', 'renewal-overdue', 'order-shipped']) {
  assert.ok(test.includes(`'${id}'`), `lib/email-samples/catalog.test.ts does not name ${id} as account mail`)
}

console.log(`EMAIL-027: ${STOCK.length} stock emails outside lib/email.ts wear a shell, are built by an export and have a catalog sample.`)
