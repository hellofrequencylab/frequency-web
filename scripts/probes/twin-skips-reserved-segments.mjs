#!/usr/bin/env node
// LIVE-1979: the public-twin table maps /journeys/<slug> to /discover/journeys/<slug> with a one-segment
// pattern, so a signed-out visitor following a link to /journeys/mine, /journeys/library, /journeys/new or
// /practices/new was redirected to a Discover URL that does not exist (the "We couldn't find that" page in
// the 2026-11-02 sweep) instead of the sign-in that carries `next`. Loads the module and asks it directly.
// Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/probes/twin-skips-reserved-segments.mjs
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
const mod = await import(pathToFileURL('lib/nav/public-twin.ts').href)
const bad = []
for (const p of ['/journeys/mine', '/journeys/library', '/journeys/new', '/practices/new', '/circles/new', '/circles/starter', '/circles/templates']) {
  if (mod.hasPublicTwin(p)) bad.push(`${p} still resolves to a Discover twin (a 404 signed out)`)
}
if (!mod.hasPublicTwin('/journeys/morning-light')) bad.push('/journeys/morning-light lost its twin')
if (mod.publicIndexTwin('/journeys') !== '/discover/journeys') bad.push('/journeys index has no public listing twin')
if (!/'\/journeys',/.test(readFileSync('proxy.ts', 'utf8'))) bad.push('proxy.ts PROTECTED_PATHS lacks /journeys, so /journeys/mine never reaches the sign-in bounce')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('member pages under a twin family stay protected; entity slugs still twin')
