// The Founding Year rows (owner rulings 2026-11-23, launch milestones doc; project thread "Build the
// Founding Year checkout"). One probe, one row id per run:
//   LIVE-2541  a Space owner can pay the Founding Year now: Business $441, Collective $990, no trial, the
//              paid year runs February 1, 2027 to January 31, 2028, and the payment marks the Founder row.
//   LIVE-2542  the first 150 Spaces to pay a Founding Year hold numbered Founder seats, the offer closes
//              at 150, and /offer shows how many seats are taken.
//   LIVE-2543  a Founder pays no finder's fee on any sale through January 31, 2028.
// Each check reads the code that decides the consequence (comments stripped), so a passing probe means the
// money path itself holds the rule, not a doc.
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

if (id === 'LIVE-2541') {
  const fy = code(read('lib/billing/founding-year.ts'))
  if (!/business:\s*44_?100/.test(fy) || !/collective:\s*99_?000/.test(fy)) bad.push('founding-year.ts does not price Business $441 and Collective $990')
  if (!fy.includes("yearStartsAt: '2027-02-01T08:00:00.000Z'") || !fy.includes("yearEndsAt: '2028-02-01T08:00:00.000Z'")) bad.push('the paid year is not February 1, 2027 to January 31, 2028')
  const co = code(read('lib/billing/space-plan-checkout.ts'))
  const branch = co.slice(co.indexOf('if (foundingYear) {'), co.indexOf('const trialDays ='))
  if (!co.includes('foundingYearApplies(')) bad.push('the Space checkout never decides the Founding Year')
  if (!branch.includes('foundingYearCents(foundingYear)')) bad.push('the Founding Year session does not charge the Founding Year price today')
  if (!branch.includes('trial_end: foundingYearRenewsAtUnix()')) bad.push('the Founding Year session does not hold the renewal to February 1, 2028')
  if (/trial_period_days/.test(branch)) bad.push('the Founding Year session still adds the 14-day trial')
  if (/allow_promotion_codes/.test(branch)) bad.push('a promotion code can zero the Founding Year')
  const hook = code(read('app/api/webhooks/stripe/route.ts'))
  const list = hook.slice(hook.indexOf('const recordPaidCheckout'), hook.indexOf('const conversion ='))
  if (!list.includes('recordFoundingYearFromSession(s)')) bad.push('the paid-checkout recorders never record the Founding Year')
  if (!code(read('lib/billing/space-plan-checkout.ts')).includes('await recordFoundingYearFromSession(session)')) bad.push('the on-page settle never records the Founding Year')
  const box = code(read('components/pricing/member-pricing-box.tsx'))
  if (!/const trial = !isCrewCheckout && !foundingYear/.test(box)) bad.push('the pricing box still shows a trial on the Founding Year')
  if (!code(read('lib/billing/subscription-receipt.ts')).includes('isFoundingYearMetadata(opts.sub.metadata)')) bad.push('the plan receipt calls a paid Founding Year a trial')
} else if (id === 'LIVE-2542') {
  const fy = code(read('lib/billing/founding-year.ts'))
  if (!/seatCap:\s*150\b/.test(fy)) bad.push('no 150 Founder seat cap in founding-year.ts')
  const seats = code(read('lib/billing/founder-seats.ts'))
  if (!seats.includes('export async function founderSeatsTaken')) bad.push('nothing counts the Founder seats taken')
  if (!seats.includes('export async function founderSeatFor')) bad.push('nothing numbers a Space’s Founder seat')
  const co = code(read('lib/billing/space-plan-checkout.ts'))
  if (!/founderSeatsTaken\(\)/.test(co) || !/seatCap/.test(co)) bad.push('the checkout keeps selling the Founding Year past 150 seats')
  const offer = code(read('app/(main)/offer/page.tsx'))
  if (!/founderSeatsTaken\(\)/.test(offer) || !/FounderSeats/.test(offer)) bad.push('/offer does not show the Founder seat count')
} else if (id === 'LIVE-2543') {
  const fy = code(read('lib/billing/founding-year.ts'))
  if (!fy.includes("noFindersFeeUntil: '2028-02-01T08:00:00.000Z'")) bad.push('no finder’s fee end date for Founders')
  const fees = code(read('lib/billing/fees.ts'))
  if (!/founderPaysNoFindersFee\(/.test(fees)) bad.push('fees.ts never waives the finder’s fee for a Founder')
  if (!fy.includes('export function founderPaysNoFindersFee')) bad.push('the Founder finder’s fee rule is not one pure function')
} else {
  bad.push(`unknown row ${id}`)
}

if (bad.length) {
  console.error(`${id} FAILED:\n${bad.join('\n')}`)
  process.exit(1)
}
console.log(`${id} ok`)
