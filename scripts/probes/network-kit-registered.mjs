#!/usr/bin/env node
// LIVE-1802: the Network Theme Kit's inner blocks are registered in the page editor and its thirteen profile kits carry the
// inner pages (About, Services, Meetups, Programs, Shop, Library) instead of plain starters.
//
// Fails when the editor config does not register networkKitInnerComponents (and list them in the networkKit palette
// category), or when the profile kits do not build their pages from the inner page builders. Run on main it fails.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
const config = r('lib/page-editor/config.tsx')
if (!/\.\.\.networkKitInnerComponents,/.test(config)) bad.push('the page editor does not register the Network inner blocks')
if (!/Object\.keys\(networkKitInnerComponents\)/.test(config)) bad.push('the Network palette category does not list the inner blocks')
const kits = r('lib/sites/kits/network-kit-profile-variants.ts')
if (!/networkKitInnerPagesA\(\)/.test(kits) || !/networkKitInnerPagesB\(\)/.test(kits)) bad.push('the profile kits do not build from the inner pages')
if (/add\('(workshops|services|journeys|shop|resources|about)'/.test(kits)) bad.push('a profile kit still builds a plain starter for a page that has an inner page')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('network-kit-registered: ok')
