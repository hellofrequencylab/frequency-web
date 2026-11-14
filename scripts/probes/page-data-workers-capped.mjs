// HYG-225: the Vercel build was OOM-killed when 'Collecting page data' forked 3 workers on top of a compile process still
// holding about 6 GB (container 7.93 of 8 GB, measured with the HYG-224 sampler). next.config.ts must cap the workers.
// Exits 1 when experimental.cpus is not set to 1 or 2.
import { readFileSync } from 'node:fs'
const src = readFileSync('next.config.ts', 'utf8').replace(/^\s*\/\/.*$/gm, '')
const m = src.match(/experimental:\s*\{[\s\S]*?\bcpus:\s*(\d+)/)
const ok = Boolean(m) && Number(m[1]) >= 1 && Number(m[1]) <= 2
console.log(`${ok ? 'ok  ' : 'FAIL'} experimental.cpus caps the page-data workers (${m ? m[1] : 'unset'})`)
process.exit(ok ? 0 : 1)
