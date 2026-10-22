#!/usr/bin/env node
// LIVE-1301 probe: a card set to "Open my link" can be pointed at any public page on Frequency from a
// search, as well as any pasted link. Fails if the editor loses the page search, or if the search stops
// using the console's public-only page search (which keeps private, draft and removed pages out).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!/<CardLinkPicker onPick=/.test(r('components/member-cards/card-face-editor.tsx'))) bad.push('the card editor has no page search')
const actions = r('lib/member-cards/actions.ts')
if (!/export async function findCardPages[\s\S]*?getMyProfileId\(\)[\s\S]*?searchTagTargets\(/.test(actions))
  bad.push('the page search is not the signed-in, public-only tag search')
if (bad.length) {
  console.error('LIVE-1301 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1301: a card link can be any page on Frequency, found by search, or any pasted link')
