#!/usr/bin/env node
// LIVE-2324: a signed-out "Get a Free Spotlight" press (and the wizard's "Keep building" link) opens the Spotlight
// builder instead of the home page. /launch/start sends a visitor with no account to /launch/step/spotlight; the
// member layout used to redirect every signed-out request it did not list as public to '/', so the builder never
// rendered (measured on production 2026-11-17: x-matched-path '/'). Checks the consequence in source:
//   1. /launch/start still sends the signed-out visitor to the Spotlight step.
//   2. The Spotlight step page still serves a signed-out visitor (signedIn={!!profileId}).
//   3. The member layout treats that path as a public view, read through isAnonLaunchPage.
//   4. isAnonLaunchPage admits exactly the Spotlight step and not the account's own launch pages.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []

const start = code(read('app/(main)/launch/start/route.ts'))
if (!/if \(!profileId\) \{[\s\S]*?redirect\(inFlowHref\('\/launch\/step\/spotlight'\)\)/.test(start)) {
  fails.push('/launch/start no longer sends a signed-out visitor to the Spotlight step (re-check this probe)')
}
const page = code(read('app/(main)/launch/step/spotlight/page.tsx'))
if (!/signedIn=\{!!profileId\}/.test(page)) fails.push('the Spotlight step no longer serves a signed-out visitor')

const layout = code(read('app/(main)/layout.tsx'))
const view = layout.match(/const isPublicView =([\s\S]*?)const user =/)?.[1] ?? ''
if (!/isAnonLaunchPage\(currentPath\)/.test(view)) fails.push('the member layout does not treat the Spotlight step as a public view')

const dest = code(read('lib/launch/destination.ts'))
const set = dest.match(/ANON_LAUNCH_PAGES = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ''
const pages = [...set.matchAll(/'([^']+)'/g)].map((m) => m[1])
if (pages.join(',') !== '/launch/step/spotlight') fails.push(`the signed-out launch pages are [${pages.join(', ')}], expected only /launch/step/spotlight`)

if (fails.length) {
  console.error(`LIVE-2324 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2324 ok: a signed-out Free Spotlight press opens the Spotlight builder, not the home page')
