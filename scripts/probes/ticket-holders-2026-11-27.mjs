// Ticket holders an owner can see and manage (owner ask 2026-11-27: "Space owners should easily be
// able to see and manage tier ticket holders from every relevant surface"; project thread "Trace the
// House of Fates payment"). One probe, one row id per run:
//   LIVE-2548  the event guest list names each holder's ticket type, seat count and amount, totals
//              holders per type, exports to CSV and can resend a ticket.
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
const dir = 'app/(main)/events/[slug]/manage'

if (id === 'LIVE-2548') {
  const load = code(read(`${dir}/load.ts`))
  const ticketRead = load.slice(load.indexOf(".from('event_tickets')"), load.indexOf('loadCheckedInIds(eventId),'))
  for (const col of ['ticket_type_id', 'qty', 'amount_cents']) {
    if (!ticketRead.includes(col)) bad.push(`the roster's ticket read does not select ${col}`)
  }
  if (!load.includes(".from('event_ticket_types')")) bad.push('the roster never reads tier names')
  const sections = code(read(`${dir}/sections.tsx`))
  if (!sections.includes('g.ticket?.tierName')) bad.push('a roster row does not name the ticket type')
  if (!sections.includes('g.ticket.qty')) bad.push('a roster row does not show how many tickets were bought')
  if (!sections.includes('tierBreakdown(roster)')) bad.push('the roster does not total holders per ticket type')
  if (!sections.includes('<RosterCsvButton')) bad.push('the roster has no CSV export')
  if (!sections.includes('<ResendTicketButton')) bad.push('the roster cannot resend a ticket')
  if (!sections.includes('<RefundTicketFromRosterButton')) bad.push('the roster cannot refund a ticket')
  const actions = code(read(`${dir}/attendance-actions.ts`))
  const resend = actions.slice(actions.indexOf('export async function resendTicketFromManage'))
  if (!resend.includes('authorizeManager(eventId)')) bad.push('resending a ticket is not gated on the event manager')
  if (!resend.includes(".eq('event_id', eventId)")) bad.push('resend does not pin the ticket to this event')
} else {
  bad.push(`unknown row ${id}`)
}

if (bad.length) {
  console.error(`${id}: FAIL\n- ${bad.join('\n- ')}`)
  process.exit(1)
}
console.log(`${id}: ok`)
