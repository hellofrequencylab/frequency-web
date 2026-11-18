#!/usr/bin/env node
// LIVE-2375 probe: Network kit's template carries no price and no free promise.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../../../lib/sites/network-kit-home.ts', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
if (/\$[0-9]|(?<!-)\bfree\b/i.test(src)) { console.error("LIVE-2375: Network kit's template still carries a price or a free promise"); process.exit(1) }
console.log("LIVE-2375: Network kit's template carries no price or free promise")
