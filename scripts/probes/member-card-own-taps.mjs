#!/usr/bin/env node
// LIVE-1295 probe: an owner's own tap on their member card is counted, a card they have set opens its
// link for them too, and a Frequency-wide card is not described as a check-in card. Fails if the tap
// route stops logging the owner's tap, if the owner is sent to settings whatever the card is set to, or
// if the card list says a Frequency-wide card checks in.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const route = r('app/c/[token]/route.ts')
const ownerBranch = /if \(target\.to === 'owner_settings'\) \{([\s\S]*?)\n  \}/.exec(route)
if (!ownerBranch || !/logCardTap\(/.test(ownerBranch[1])) bad.push("the owner's own tap is not counted")
if (!/owner\.kind === 'member' && face\.mode === 'page' && tapperProfileId/.test(r('lib/member-cards/face.ts')))
  bad.push('the owner is sent to settings even after setting a link or the virtual card')
if (/Checks in at every Space/.test(r('components/member-cards/my-cards-list.tsx'))) bad.push('a Frequency-wide card is described as checking in at every Space')
if (bad.length) {
  console.error('LIVE-1295 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log("LIVE-1295: the owner's own taps count, and a set card opens its link for its owner")
