#!/usr/bin/env node
// EMAIL-087: the first-touch cookie keeps only what attribution needs. On 2026-11-19 it stored up to 300 characters of
// the full referrer URL (query string included) for 90 days and was not marked Secure. Contact audit 2026-11-19
// (Wave 3). Passes when the referrer is reduced to its site name and the cookie is set Secure.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (f) => { const u = new URL(f, root); return existsSync(u) ? strip(readFileSync(u, 'utf8')) : null }
const fails = []
const ft = read('lib/attribution/first-touch.ts')
if (ft === null) fails.push('lib/attribution/first-touch.ts is gone (re-check this probe)')
else {
  if (/clip\(\s*referrer\s*,/.test(ft)) fails.push('buildFirstTouch still stores the raw referrer URL')
  if (!/hostname/.test(ft)) fails.push('buildFirstTouch never reduces the referrer to its site name')
}
const proxy = read('proxy.ts')
if (proxy === null) fails.push('proxy.ts is gone (re-check this probe)')
else {
  const m = proxy.match(/cookies\.set\(\s*FIRST_TOUCH_COOKIE[\s\S]{0,400}?\}\s*\)/)
  if (!m) fails.push('proxy.ts no longer sets the first-touch cookie where this probe looks (re-check it)')
  else if (!/secure\s*:/.test(m[0])) fails.push('the first-touch cookie is not marked Secure')
}
if (fails.length) { console.error(`EMAIL-087 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-087 ok: first-touch keeps the referring site only, on a Secure cookie')
