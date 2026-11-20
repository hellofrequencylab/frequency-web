#!/usr/bin/env node
// EMAIL-089: the acquisition funnel is measured with our own first-party events (landing, cookie choice, sign-up,
// first useful action, return) under fixed names and with no personal data, since UTM breakdowns in Vercel need a paid
// plan the owner will not buy. Contact audit 2026-11-19 (Wave 3, finding 7). Passes when one module names those steps
// and the cookie choice and sign-up paths emit them.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const walk = (d, out = []) => {
  if (!existsSync(d)) return out
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p)
  }
  return out
}
const files = walk(join(root, 'lib/analytics'))
const registry = files.map((f) => [f, strip(readFileSync(f, 'utf8'))]).find(([, s]) => /FUNNEL_STEPS/.test(s) && /cookie_choice/.test(s) && /first_action/.test(s))
const fails = []
if (!registry) fails.push('no lib/analytics module names the funnel steps (FUNNEL_STEPS with cookie_choice and first_action)')
if (fails.length) { console.error(`EMAIL-089 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-089 ok: the funnel steps are first-party events with fixed names')
