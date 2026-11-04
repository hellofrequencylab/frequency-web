// LIVE-2148: CyberWitch is offered in the pickers and its feature page is indexable.
import { readFileSync } from 'node:fs'
const style = readFileSync('lib/theme/site-style.ts', 'utf8')
const m = style.match(/RETIRED_FROM_PICKERS[^=]*=\s*new Set\(\[([^\]]*)\]/)
if (!m || m[1].includes('cyberwitch')) { console.error('cyberwitch is still hidden from the pickers'); process.exit(1) }
if (!readFileSync('app/sitemap.ts', 'utf8').includes('/themes/cyberwitch')) { console.error('/themes/cyberwitch is not in the sitemap'); process.exit(1) }
console.log('cyberwitch is offered and indexable')
