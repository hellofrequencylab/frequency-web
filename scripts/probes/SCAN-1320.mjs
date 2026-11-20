#!/usr/bin/env node
// SCAN-1320: copy polish from the deep audit (2026-11-19). Invented claims, unpluralised counts, em dashes
// the canon gate could not see, a leaked retired theme name, a dead "Coming soon" theme card and an
// internal role name in Vera's tool text.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const fails = []
const themes = ['designer', 'midnight', 'network', 'new-world', 'temple']
for (const t of themes) {
  if (read(`components/frequency/site/pages/themes/frequency-${t}.tsx`).includes('Most people do.')) fails.push(`${t} theme FAQ still claims "Most people do."`)
}
if (read('components/frequency/members/circle/circle-meetups.tsx').includes('Most people do.')) fails.push('circle meetups still claims "Most people do."')
for (const k of ['cyberwitch', 'mindless', 'new-world', 'services']) {
  if (read(`lib/theme/${k}-kit-email.ts`).includes('before it fills')) fails.push(`${k} kit email still uses "before it fills" urgency`)
}
if (!/people\.length === 1 \? 'member' : 'members'/.test(read('components/frequency/members/circle/members-pane.tsx'))) fails.push('members pane says "Search 1 members"')
if (!/left === 1 \? 'seat' : 'seats'/.test(read('app/(main)/circles/[slug]/(circle)/members/page.tsx'))) fails.push('circle members page says "1 seats left"')
if (!/seatsLeft === 1 \? 'seat' : 'seats'/.test(read('components/spaces/enroll/enroll-member.tsx'))) fails.push('enrolment says "1 seats left"')
if (/value: '[^']*—/.test(read('lib/qr/destinations.ts'))) fails.push('QR destination copy still carries em dashes')
if (!/'copy', 'value', 'detail', 'lede'/.test(read('scripts/check-canon.mjs'))) fails.push('check-canon COPY_KEYS does not read value, detail and lede')
if (read('app/(demo)/themes/nocturne/demo/page.tsx').includes('Midnight demo site')) fails.push('Nocturne demo metadata says Midnight')
if (read('components/spaces/space-branding-form.tsx').includes("label: 'Woman'")) fails.push('Space owners still see a dead Woman theme card')
if (read('lib/ai/vera/read-tools.ts').includes('a janitor can connect')) fails.push('Vera tool text leaks the janitor role')
if (fails.length) {
  console.error(`SCAN-1320 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log('SCAN-1320 ok: no invented claims, counts pluralise, QR copy plain and gated, Nocturne named, no dead theme card')
