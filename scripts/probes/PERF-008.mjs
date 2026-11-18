#!/usr/bin/env node
// PERF-008: every signed-in page waited about 0.6 to 1.1 s before its first byte on production (2026-11-18),
// while the same pages signed out answered in about 0.2 s. Supabase's edge log for one signed-in /settings load
// showed the cost: a GET /auth/v1/user from the proxy (about 130 ms), a second one from the page, then the
// member shell's reads in four serial waves, with the My Frequency menu and the offer bar at the tail.
// /events signed in added the Around you ranking as six reads in series. Checks the consequence in source:
//   1. The proxy verifies the session token locally (getClaims) instead of a network getUser (owner ruling
//      2026-11-18: only the proxy's check; the page keeps its strict getUser).
//   2. The member shell starts the offer "is it due" read beside its wave, not after it.
//   3. My Frequency reads host seats and owned Circles together.
//   4. The /events loader issues its public read before awaiting the viewer, and the payout gate and the
//      payee read run together.
//   5. The Around you ranking reads in three waves, not six.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const code = (p) => read(p).replace(/^\s*\/\/.*$/gm, '')
const fails = []

const proxy = code('proxy.ts')
if (/auth\.getUser\(\)/.test(proxy)) fails.push('the proxy still makes a network getUser() call on every signed-in request')
if (!/auth\.getClaims\(\)/.test(proxy)) fails.push('the proxy does not verify the session locally with getClaims()')

const auth = code('lib/auth.ts')
if (!/auth\.getUser\(\)/.test(auth)) fails.push('the page-side strict getUser() check is gone (the owner kept it)')

const layout = code('app/(main)/layout.tsx')
const prefetchAt = layout.indexOf('prefetchOfferDue(profile.id')
const waveAt = layout.indexOf('] = await Promise.all([\n    applyViewAs(realRole)')
if (prefetchAt < 0 || waveAt < 0 || prefetchAt > waveAt) fails.push('the shell does not start the offer read before its parallel wave')
if (!/offerBarState\([^)]*offerDueP\)/.test(layout)) fails.push('the offer bar does not use the early read')

const myFreq = code('lib/nav/my-frequency.ts')
const myCircles = myFreq.slice(myFreq.indexOf('async function myCircles'), myFreq.indexOf('const MAX_ENTRIES'))
if (!/Promise\.all\(\[[\s\S]*from\('memberships'\)[\s\S]*from\('circles'\)\.select\('id'\)\.eq\('host_id'/.test(myCircles)) {
  fails.push('My Frequency still reads host seats and owned Circles in series')
}

const loader = code('app/(main)/events/index-data.ts')
const body = loader.slice(loader.indexOf('export async function getEventsIndexData'))
const publicAt = body.indexOf('const rawPublicP')
const viewerAt = body.indexOf('await getCachedViewerProfile()')
if (publicAt < 0 || viewerAt < 0 || publicAt > viewerAt) fails.push('the /events public read still waits for the viewer')
const gate = body.match(/const gateP = Promise\.all\(\[([^\]]*)\]\)/)
if (!gate || /resolvePageContent/.test(gate[1]) || !/await gateP/.test(body.slice(0, publicAt))) {
  fails.push('the /events queries still wait on the page header content')
}

const connect = code('lib/billing/connect.ts')
const readyMap = connect.slice(connect.indexOf('export async function getConnectReadyMap'))
if (!/Promise\.all\(\[\s*payoutsLive\(\)/.test(readyMap.slice(0, 1200))) fails.push('the payout gate and the payee read still run in series')

const matching = code('lib/events/matching.ts')
const score = matching.slice(matching.indexOf('export async function scoreEventsForViewer'))
const firstWave = score.slice(0, score.indexOf('if (events.length === 0) return []'))
if (!/from\('friendships'\)/.test(firstWave) || !/from\('profiles'\)/.test(firstWave)) {
  fails.push('the Around you ranking does not read the viewer-only rows in its first wave')
}
if (/const \{ data: mates \} = await client/.test(score) || /const \{ data: circles \} = await client/.test(score)) {
  fails.push('the Around you ranking still reads circle-mates and host-circle coordinates one by one')
}

if (fails.length) {
  console.error(`PERF-008 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('PERF-008 ok: signed-in pages skip the proxy auth round trip and the shell and /events read in parallel waves')
