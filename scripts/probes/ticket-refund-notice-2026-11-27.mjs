// A refunded ticket tells both sides (owner ask 2026-11-27: "We should be able to easily manage and
// track"; project thread "Trace the House of Fates payment"). One row id per run:
//   LIVE-2551  the refund recorder tells the buyer and the payee once per refunded ticket, and stays
//              silent on a cancelled event.
// Each check reads the code that decides the consequence (comments stripped).
import { readFileSync } from 'node:fs'

const id = process.argv[2]
const bad = []
const read = (f) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    bad.push(`cannot read ${f}`)
    return ''
  }
}
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

if (id === 'LIVE-2551') {
  const tickets = code(read('lib/billing/tickets.ts'))
  const rec = tickets.slice(tickets.indexOf('export async function recordTicketRefund('), tickets.indexOf('export async function recordTicketRefundFromCharge'))
  if (!rec.includes('notifyTicketRefund(row.id)')) bad.push('the refund recorder tells nobody')
  const n = code(read('lib/billing/ticket-refund-notify.ts'))
  if (!n.includes('ticket-refund-buyer:')) bad.push('the buyer is not emailed about a refund (or the email is not deduped)')
  if (!n.includes('ticket-refund-host:')) bad.push('the payee is not emailed about a refund (or the email is not deduped)')
  if (!n.includes(".from('notifications').insert(")) bad.push('the payee gets no bell for a refund')
  if (!n.includes('if (ev.is_cancelled) return')) bad.push('a cancelled event would be told twice')
  if (!n.includes('isSuppressed(ticket.guest_email)')) bad.push('a guest address is mailed without the suppression check')
} else {
  bad.push(`unknown row ${id}`)
}

if (bad.length) {
  console.error(`${id}: FAIL\n- ${bad.join('\n- ')}`)
  process.exit(1)
}
console.log(`${id}: ok`)
