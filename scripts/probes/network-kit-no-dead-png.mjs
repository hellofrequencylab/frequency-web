// SCAN-1198: the seven unreferenced Network kit placeholder PNGs (7.5 MB) no longer ship in public/.
import { readdirSync } from 'node:fs'
const bad = readdirSync('public/sites/network-kit/photos').filter((f) => /^placeholder-.*\.png$/.test(f))
if (bad.length) { console.error('FAIL: dead placeholder PNGs still shipped', bad); process.exit(1) }
console.log('ok')
