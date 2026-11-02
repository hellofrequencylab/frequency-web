// SEC-018: the home time zone literal lives in one module (lib/time/home-zone.ts); code reads HOME_TZ.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const ALLOW = new Set(['lib/time/home-zone.ts', 'lib/time/zone.ts', 'lib/time/zone-words.ts', 'lib/events/time-zones.ts'])
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = join(d, e.name); return e.name === 'node_modules' || e.name === '.next' ? [] : e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.|fixtures|email-samples/.test(p) ? [p] : [] })
const bad = []
for (const f of ['app', 'lib', 'components'].flatMap(walk)) {
  if (ALLOW.has(f)) continue
  for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
    const t = line.trimStart()
    if (/'America\/Los_Angeles'/.test(line) && !/^(\/\/|\*|\/\*)/.test(t)) bad.push(`${f}:${i + 1}`)
  }
}
if (bad.length) { console.error('FAIL literal home zone outside lib/time/home-zone.ts:', bad); process.exit(1) }
console.log('ok: home zone has one source')
