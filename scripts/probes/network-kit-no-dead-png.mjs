// SCAN-1193: no unreferenced multi-megabyte PNG placeholders ship in public/sites/network-kit/photos.
import { readdirSync } from 'node:fs'
const bad = readdirSync('public/sites/network-kit/photos').filter((f) => /^placeholder-.*\.png$/.test(f))
if (bad.length) { console.error('FAIL: dead placeholder PNGs still shipped', bad); process.exit(1) }
console.log('ok')
