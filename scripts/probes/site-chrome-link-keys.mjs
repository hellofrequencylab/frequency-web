#!/usr/bin/env node
// LIVE-1975: a Space website's header nav, mobile menu and footer link list keyed each link on its href
// alone. A menu whose items share one href (the Nocturne demo at /themes/nocturne/demo points its four
// menu items at the demo home) logged React's duplicate-key warning on every load, measured 2026-11-02 in a
// browser (20 warnings per page view across five widths). Keys now carry href and label.
import { readFileSync } from 'node:fs'
const files = ['components/sites/house-header.tsx', 'components/sites/house-menu.tsx', 'components/sites/site-chrome.tsx']
const bad = []
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  if (/key=\{l\.href\}/.test(s)) bad.push(`${f} still keys a link list on href alone`)
  if (!/key=\{`\$\{l\.href\}:\$\{l\.label\}`\}/.test(s)) bad.push(`${f} has no href+label key`)
}
if (bad.length) {
  console.error(bad.join('; '))
  process.exit(1)
}
console.log('site chrome link lists key on href and label')
