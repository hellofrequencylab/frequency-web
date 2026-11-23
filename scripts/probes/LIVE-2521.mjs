// LIVE-2521: a file in public/ under a site's folder is served as itself on a custom domain. The proxy matcher skipped image
// extensions only, so on aidentyack.com a request for the background clip (/sites/aiden-tyack/video/at-the-bench.mp4) was
// rewritten into the hosted site and answered 404, and the loop never played. This builds the matcher's own first entry from
// proxy.ts and tests it against every tracked file under public/sites and public/themes: none of them may reach the proxy.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const src = readFileSync('proxy.ts', 'utf8')
const config = src.slice(src.indexOf('export const config'))
const m = /matcher:\s*\[[\s\S]*?\n\s*'(\/\(\(\?![^']+)'/.exec(config)
if (!m) { console.error('LIVE-2521: no matcher entry found in proxy.ts'); process.exit(1) }
const re = new RegExp('^' + m[1].replace(/\\\\/g, '\\') + '$')
const files = execFileSync('git', ['ls-files', 'public/sites', 'public/themes'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const reached = files.map((f) => f.slice('public'.length)).filter((p) => re.test(p))
const clips = files.filter((f) => /\.(mp4|webm)$/.test(f)).length
console.log(`LIVE-2521: ${files.length - reached.length} of ${files.length} site and theme files (${clips} clips) skip the proxy: ${reached.length ? 'RED' : 'ok'}`)
for (const p of reached.slice(0, 20)) console.error('  reaches the proxy: ' + p)
if (!files.length || !clips || reached.length) process.exit(1)
