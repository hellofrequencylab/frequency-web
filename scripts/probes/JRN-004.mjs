#!/usr/bin/env node
// JRN-004: a signed-out visitor who opens a Journey link, or presses "Create a free account" on a Journey's
// public page, signs in and lands back on that Journey (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const twin = read('lib/nav/public-twin.ts')
if (/kind: 'direct', re: \/\^\\\/journeys/.test(twin)) fails.push('/journeys/<slug> is a direct rewrite to /discover, so an unlisted Journey link 404s for a signed-out visitor')
const layout = read('app/(main)/layout.tsx')
if (!/match\.lookup === 'journey'[\s\S]{0,900}sign-in\?next=/.test(layout)) fails.push('the (main) layout has no journey lookup that falls back to sign-in with next')
const page = read('components/frequency/site/pages/discover/journeys.tsx')
if (/href="\/sign-in"|href: '\/sign-in'/.test(page)) fails.push('the free Journey page sends "Create a free account" to a bare /sign-in, losing the Journey')
const neu = read('app/(main)/journeys/new/page.tsx')
if (/if \(!user\) redirect\('\/'\)/.test(neu)) fails.push('/journeys/new sends a signed-out visitor to / instead of sign-in with next')

if (fails.length) {
  console.error(`JRN-004 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-004 ok: signed-out Journey visitors sign in and come back to the Journey')
