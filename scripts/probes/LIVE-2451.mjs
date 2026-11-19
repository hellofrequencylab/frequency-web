// LIVE-2451: the New World profile look's main button reads the owner's own label for the link, not the bare host.
import { readFileSync } from 'node:fs'
const src = readFileSync('lib/spotlight/new-world-kit-content.ts', 'utf8')
const ok = /cta: primary \? \{ label: primary\.label\.trim\(\) \|\| host\(primary\.url\)/.test(src)
if (!ok) { console.error('LIVE-2451: the profile button still labels itself with the host'); process.exit(1) }
console.log('LIVE-2451 ok')
