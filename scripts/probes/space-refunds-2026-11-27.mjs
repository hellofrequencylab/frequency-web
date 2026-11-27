// A Space refunds its own sales from the Orders tab (owner ask 2026-11-27: "We should be able to
// easily manage and track"; project thread "Trace the House of Fates payment"). One row id per run:
//   LIVE-2550  the Orders tab can refund a shop order, a ticket or a donation; the refund is the
//              owner's or a Space admin's and is pinned to the Space before money moves.
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
const shop = 'app/(main)/spaces/[slug]/settings/shop'

if (id === 'LIVE-2550') {
  const lib = code(read('lib/commerce/space-refunds.ts'))
  if (!lib.includes('order.owner_space_id !== spaceId')) bad.push('an order refund is not pinned to the Space that owns it')
  if (!lib.includes('eventSellsForSpace(')) bad.push('a ticket refund is not pinned to an event this Space sells')
  if (!lib.includes('refundSpaceDonation(id, spaceId)')) bad.push('a donation refund is not pinned to the Space')
  if (!/funds_flow === 'separate'[\s\S]{0,120}error/.test(lib)) bad.push('a split order is not kept away from the Space refund door')
  const donation = code(read('lib/billing/space-donation-checkout.ts'))
  const fn = donation.slice(donation.indexOf('export async function refundSpaceDonation'))
  if (!fn.startsWith('export async function refundSpaceDonation')) bad.push('a donation has no refund path')
  if (!fn.includes(".eq('space_id', spaceId)")) bad.push('the donation refund does not read the gift by its Space')
  if (!/reverse_transfer: true[\s\S]{0,80}refund_application_fee: true/.test(fn)) bad.push('the donation refund does not unwind the destination charge')
  const actions = code(read(`${shop}/shop-actions.ts`))
  const act = actions.slice(actions.indexOf('export async function refundSpaceSaleAction'))
  if (!act.startsWith('export async function refundSpaceSaleAction')) bad.push('the Shop has no refund action')
  if (!act.slice(0, 700).includes("gate.role !== 'admin'")) bad.push('the refund action is not held to the owner or a Space admin')
  const tab = code(read(`${shop}/orders-tab.tsx`))
  if ((tab.match(/<RefundSaleButton/g) ?? []).length < 2) bad.push('the Orders tab does not offer a refund on both orders and other sales')
  if (!tab.includes('canRefund &&')) bad.push('the refund door is shown without checking who is looking')
} else {
  bad.push(`unknown row ${id}`)
}

if (bad.length) {
  console.error(`${id}: FAIL\n- ${bad.join('\n- ')}`)
  process.exit(1)
}
console.log(`${id}: ok`)
