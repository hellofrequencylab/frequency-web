// Fails today: freq.ie has no short-link host handling, so freq.ie/<code> cannot open a share link.
import { readFileSync } from 'node:fs'
const host = readFileSync('lib/sites/host.ts', 'utf8')
if (!host.includes('freq.ie')) { console.error('lib/sites/host.ts has no freq.ie short-link host'); process.exit(1) }
console.log('ok')
