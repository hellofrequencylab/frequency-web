#!/usr/bin/env node
// SCAN-1179: a card's "Open my link" finder must accept a pasted web address. Typing or pasting a link into the
// page search used to end at "No pages match", which read as "can't find it". Fails when the picker does not offer
// the typed address as a choice. Run on main it fails: the picker only lists searched pages.
import { existsSync, readFileSync } from 'node:fs'

const f = 'components/member-cards/card-link-picker.tsx'
const src = existsSync(f) ? readFileSync(f, 'utf8') : ''
const bad = []
if (!/normalizeCardLink/.test(src)) bad.push('the picker does not read a typed address')
if (!/typedLink/.test(src) || !/onPick\(typedLink\)/.test(src)) bad.push('the picker does not offer the typed address as a choice')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('ok')
