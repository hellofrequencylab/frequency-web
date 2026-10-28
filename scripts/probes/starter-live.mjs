#!/usr/bin/env node
// VLS-04: a starter site is live only when its address loads.
//
// Fails when the state helper says live before the address answers 200, or when publishStarterSite stops
// asking for the free address. Runs the real helper under node with a stand-in fetch.
import { readFileSync } from 'node:fs'
import { requestSiteAddress, starterSiteState } from '../../lib/sites/site-address.ts'

const answer = (status) => async () => new Response(null, { status })
const down = async () => { throw new TypeError('fetch failed') }
const bad = []

if ((await starterSiteState('alli', { fetchImpl: answer(200) })) !== 'live') bad.push('a 200 from the address is not live')
for (const status of [404, 301, 502]) if ((await starterSiteState('alli', { fetchImpl: answer(status) })) !== 'finishing') bad.push(`a ${status} was called live`)
if ((await starterSiteState('alli', { fetchImpl: down })) !== 'finishing') bad.push('an unreachable address was called live')

const hosts = []
await requestSiteAddress('alli', async (h) => { hosts.push(h); return { ok: true } })
if (hosts.join() !== 'alli.frequencylocal.com') bad.push('the free host is not what gets attached')

const starter = readFileSync('lib/spaces/starter-site.ts', 'utf8')
if (!/requestSiteAddress/.test(starter) || !/addSiteSubdomain/.test(starter)) bad.push('publishStarterSite no longer requests the address')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('A starter site asks for its address when it lands, and is live only after the address answers 200.')
