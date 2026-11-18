#!/usr/bin/env node
// LIVE-2374 probe: New World's starter kits carry no sample offer price and no free promise.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../../../lib/sites/kits/new-world-variants.ts', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const BAD = [
  [/price: '[^']+'/, 'a sample offer price'],
  [/\$[0-9](?![0-9]*\*)/, 'a price'],
  [/(?<!-)\bfree\b/i, 'a free promise'],
]
for (const [re, what] of BAD) if (re.test(src)) { console.error(`LIVE-2374: New World's kits still carry ${what}`); process.exit(1) }
console.log("LIVE-2374: New World's kits carry no sample offer price or free promise")
