#!/usr/bin/env node
// On a Mindless website the timer runs: a drill plays in place and the timer section keeps time.
// Fails while: the session player has no running half, a seeded drill still links away instead of
// playing, the Mindless family has no timer section, the Mindless sheet leaves the timer rules out,
// or the timer rules name a colour of their own or reach outside a Mindless site.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const player = read('components/sites/mindless-timer.tsx')
if (!/^'use client'/.test(player)) fails.push('components/sites/mindless-timer.tsx is missing or is not a client component')
if (!/setInterval\(/.test(player) || !/role="progressbar"/.test(player)) fails.push('the session player does not keep time or report its progress')
if (!/endChime\(/.test(player)) fails.push('the session ends without its bell')

const blocks = read('components/page-editor/blocks/mindless.tsx')
if (!/MindlessTimer: block\(/.test(blocks)) fails.push('the Mindless family has no timer section')
if (!/<MindlessPlayer /.test(blocks)) fails.push('a drill never runs in place')

const home = read('lib/sites/mindless-home.ts')
const drills = home.match(/drills: \[([\s\S]*?)\n  \]/)?.[1] ?? ''
if (!drills) fails.push('the Home has no drills')
else if (/href: '[^']+'/.test(drills)) fails.push('a seeded drill links away, so "Try one now" opens another page instead of a timer')

const sheet = read('components/sites/mindless-css.ts')
if (!/\$\{MINDLESS_TIMER_CSS\}/.test(sheet)) fails.push('the Mindless sheet leaves the timer rules out')
const css = read('lib/theme/mindless-timer-css.ts')
const rules = css.match(/MINDLESS_TIMER_CSS = `([\s\S]*)`/)?.[1] ?? ''
if (!rules) fails.push('lib/theme/mindless-timer-css.ts has no rules')
if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(rules)) fails.push('the timer rules name a colour instead of a design token')
const SCOPE = '[data-house-theme="mindless"]'
if (!css.includes(`const M = '${SCOPE}'`)) fails.push('the timer rules are not scoped to a Mindless site')
for (const sel of rules.replaceAll('${M}', SCOPE).replace(/@media[^{]*\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)) {
  for (const one of sel.split(',')) if (!one.trim().startsWith(SCOPE)) fails.push(`a timer rule reaches outside a Mindless site: ${one.trim().slice(0, 60)}`)
}

if (fails.length) {
  console.log(`FAIL LIVE-2392\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2392')
