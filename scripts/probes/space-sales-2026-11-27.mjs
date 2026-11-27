// Space owners can track every sale (owner ask 2026-11-27, project thread "Trace the House of Fates
// payment"). A real $44 ticket sale to House of Fates counted in the Orders tab's money cards
// ("2 orders, $88") while the list below said "No orders yet." One probe, one row id per run:
//   LIVE-2545  the Space Orders tab lists ticket sales and donations (buyer, item, amount, date,
//              status) beside shop orders, so the list counts the same sales as the cards.
//   LIVE-2546  the host's sale bell names the amount, and the sale email links to the Orders tab.
//   LIVE-2547  staff can find any payment across every Space in one admin view.
//   LIVE-2549  a contact record lists what that person bought from the Space, with a total.
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

if (id === 'LIVE-2545') {
  const sales = code(read('lib/commerce/space-sales.ts'))
  if (!sales.includes(".from('event_tickets')")) bad.push('space-sales.ts never reads ticket sales')
  if (!sales.includes(".from('space_donations')")) bad.push('space-sales.ts never reads donations')
  if (!sales.includes('host_space_id.eq.${spaceId},and(space_id.eq.${spaceId},host_space_id.is.null)')) bad.push('ticket sales do not use the same event rule as the earnings cards')
  if (!/guest_email/.test(sales)) bad.push('a guest buyer is not named by the email they paid with')
  const tab = code(read('app/(main)/spaces/[slug]/settings/shop/orders-tab.tsx'))
  if (!tab.includes('listSpaceTicketAndDonationSales(spaceId')) bad.push('the Orders tab does not list ticket sales and donations')
  if (/if \(orders\.length === 0\)/.test(tab)) bad.push('the Orders tab still shows "No orders yet." whenever there are no shop orders')
  if (!/buyer/.test(tab)) bad.push('the Orders tab rows do not name the buyer')
} else if (id === 'LIVE-2546') {
  const n = code(read('lib/billing/ticket-sale-notify.ts'))
  const bell = n.slice(n.indexOf(".from('notifications').insert("), n.indexOf('if (bellErr)'))
  if (!/bellAmount|grossLabel|formatPriceCents/.test(bell)) bad.push('the sale bell does not name the amount')
  if (!/settings\/shop\?tab=orders/.test(n)) bad.push('the sale email does not link to the Orders tab')
} else if (id === 'LIVE-2547') {
  const page = code(read('app/(main)/admin/payments/page.tsx'))
  if (!page.includes('requireAdmin(')) bad.push('no admin payments page behind requireAdmin')
  const lib = code(read('lib/admin/payments-finder.ts'))
  for (const t of ['event_tickets', 'space_donations', 'commerce_orders']) {
    if (!lib.includes(`.from('${t}')`)) bad.push(`the payment finder does not search ${t}`)
  }
} else if (id === 'LIVE-2549') {
  const sales = code(read('lib/commerce/space-sales.ts'))
  const fn = sales.slice(sales.indexOf('export async function listSpacePurchasesForPerson'))
  if (!fn) bad.push('no per-person purchase read')
  if (!/owner_space_id', spaceId/.test(fn) || !fn.includes('ticketSales(spaceId')) bad.push('purchases are not scoped to the Space')
  const view = code(read('modules/crm/components/space-contact-detail.tsx'))
  if (!view.includes('listSpacePurchasesForPerson(spaceId')) bad.push('the contact record never reads purchases')
  if (view.indexOf('listSpacePurchasesForPerson(spaceId') < view.indexOf('getSpaceContactDetail(spaceId')) bad.push('purchases are read before the owner gate answers')
  if (!view.includes('title="Purchases"')) bad.push('the contact record has no Purchases section')
  if (!view.includes('lifetimeSpendCents(purchases)')) bad.push('the contact record does not total what the person spent')
} else {
  bad.push(`unknown row ${id}`)
}

if (bad.length) {
  console.error(`${id}: FAIL\n- ${bad.join('\n- ')}`)
  process.exit(1)
}
console.log(`${id}: ok`)
