// LIVE-911 probe (LAUNCH-MARKETING-PLAN §14, Phase 0.2): the niche doors, About and the Eventbrite
// comparison stop making money claims the product no longer honors. Selling starts at Business
// (ADR-1709), so no door may sell a plan as the reason for the repeat, promise "100% of what you bring
// in", or put tickets on a free Space; About may not say taking money is never behind a plan; the
// Eventbrite page may not call Frequency the free room with 0% "always". Every door trustLine names
// card processing beside its 0% promise. Reads source only; no runtime, no network.
//
//   node scripts/probes/launch-0-2-doors-about.mjs
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const failures = []

const BANNED = {
  'lib/marketing/funnel-config.ts': [
    [/A plan is for the/, 'a spark card sells a plan as the reason for the repeat (retired ADR-914)'],
    [/You keep 100% of/, '"You keep 100% of ..." with no card processing beside it'],
    [/made perfect/i, 'the coaches hero promises "made perfect"'],
    [/Keep all of it/i, 'the nonprofit hero promises "Keep all of it"'],
    [/the money is yours/i, 'the event-hosts ticket card says "the money is yours"'],
    [/you keep what you bring in/i, 'the teachers workshop card says "you keep what you bring in"'],
    [/network rate drops/i, 'the teachers pricing intro says the network rate drops on Business'],
    [/your tickets, ready in a few minutes/i, 'the event-hosts step one puts tickets on a free Space'],
    [/Take bookings and payments the same day/i, 'the coaches step takes payments on a free Space'],
  ],
  'lib/page-editor/templates/about.ts': [
    [/never behind a plan/i, 'About says taking money is never behind a plan'],
  ],
}

for (const [file, rules] of Object.entries(BANNED)) {
  const src = read(file)
  for (const [re, why] of rules) if (re.test(src)) failures.push(`${file}: ${why}`)
}

// The doors: every hero trustLine carries "plus card processing" (six doors, six lines).
const funnel = read('lib/marketing/funnel-config.ts')
const trustLines = [...funnel.matchAll(/trustLine:\s*(['"`])(.*?)\1/g)].map((m) => m[2])
if (trustLines.length < 6) failures.push(`funnel-config.ts: expected 6 door trustLines, found ${trustLines.length}`)
for (const t of trustLines) {
  if (!/plus card processing/.test(t)) failures.push(`funnel-config.ts: trustLine without "plus card processing": "${t}"`)
}

// The Eventbrite comparison, scoped to its own entry.
const comparisons = read('lib/marketing/comparisons.ts')
const start = comparisons.indexOf("slug: 'eventbrite'")
const end = comparisons.indexOf('slug:', start + 5)
if (start < 0) failures.push('comparisons.ts: the eventbrite entry is missing')
else {
  const eb = comparisons.slice(start, end < 0 ? undefined : end)
  for (const [re, why] of [
    [/small, free, repeating room/i, 'Eventbrite calls Frequency the free room, contradicting /for/event-hosts'],
    [/0% on your own bookings, always/i, 'Eventbrite promises 0% "always" with no Business or card processing'],
    [/Free to join, always/i, 'the Eventbrite cost row hides the Business plan'],
  ]) if (re.test(eb)) failures.push(`comparisons.ts (eventbrite): ${why}`)
  if (!/plus card processing|only card processing/.test(eb)) failures.push('comparisons.ts (eventbrite): no card processing beside the 0% claim')
  if (!/PLAN_STORY\.selling/.test(eb)) failures.push('comparisons.ts (eventbrite): the money beat does not read PLAN_STORY.selling')
}

if (failures.length) {
  console.error(`LIVE-911: ${failures.length} retired money claim(s) are back:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`LIVE-911: doors, About and the Eventbrite comparison carry no retired money claim (${trustLines.length} trustLines name card processing).`)
