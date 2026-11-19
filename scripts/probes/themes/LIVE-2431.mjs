#!/usr/bin/env node
// LIVE-2431 probe: the Mindless template defaults (block defaults, starter kits, sample email brand) carry no brand specifics:
// no place, price, host name or brand promise. Reads the sources (no build).
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const problems = []
const files = ['lib/sites/mindless-home.ts', 'lib/sites/kits/mindless-variants.ts', 'lib/sites/kits/mindless-profile-index.ts']
const banned = [/San Diego/, /Encinitas/, /\$\d/, /\bDaniel\b/, /keeps a circle free/i, /Mindless circle/, /Mindless guide/]
for (const f of files) {
  const src = read(f)
  for (const re of banned) if (re.test(src)) problems.push(`${f} still says ${re}`)
}
const catalog = read('lib/email-samples/catalog.ts')
const brand = catalog.match(/MINDLESS_BRAND[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? ''
if (!brand) problems.push('MINDLESS_BRAND not found in lib/email-samples/catalog.ts')
for (const re of [/San Diego/, /\bDaniel\b/, /mindless\.(com|org|co)/i]) if (re.test(brand)) problems.push(`MINDLESS_BRAND still says ${re}`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
console.log('LIVE-2431: Mindless template defaults coach and carry no brand specifics')
