#!/usr/bin/env node
// LIVE-1142 probe: venues and networks have their own day 0, 1, 3 and 7 operator email wording.
import { readFileSync } from 'node:fs'

const s = readFileSync('lib/marketing/operator-emails.ts', 'utf8')
const bad = []
if (!/'venue' \| 'network'/.test(s)) bad.push('OperatorFocus no longer has venue and network')
if ((s.match(/^  venue: \{/gm) ?? []).length < 4) bad.push('a day is missing its venue variant')
if ((s.match(/^  network: \{/gm) ?? []).length < 4) bad.push('a day is missing its network variant')
if (bad.length) {
  console.error('LIVE-1142 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1142: venue and network operator email variants present')
