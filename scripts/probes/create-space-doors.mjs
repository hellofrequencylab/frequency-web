#!/usr/bin/env node
// LIVE-1969 (Daniel-approved Gate A re-aim, 2026-11-11): surviving create-space doors still prime the wizard, while retired campaign doors redirect.
// The door rule imports catalogs through the `@/` alias, so Vitest proves the rule over real doors; this probe checks page wiring.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const page = read('app/(main)/spaces/new/page.tsx')
const studio = read('components/frequency/site/pages/create-space/create-space-studio.tsx')
const door = read('lib/create-space/door.ts')
const handoff = read('lib/create-space/handoff.ts')
const site = read('lib/site.ts')
const forDoors = read('lib/funnels/definitions.ts')
const config = read('next.config.ts')

// /spaces/new still sends signed-out operators to the wizard; signed-in members retain the launch destination.
if (!/if \(!profileId\) redirect\(createSpaceDoorHref\(params\)\)/.test(page)) bad.push('a signed-out arrival at /spaces/new is not sent to /create-a-space')
if (/\/sign-in\?next=/.test(page)) bad.push('/spaces/new still bounces a visitor to /sign-in')
if (!/launchHomeHref\(\{ signedIn: true \}\)/.test(page) || !/\/launch\/start/.test(page)) bad.push('a signed-in member no longer lands on the launch')

// The proxy makes the same hop before the (main) layout can bounce a visitor home.
const proxy = read('proxy.ts')
if (/SESSION_ROUTES = new Set\(\[[^\]]*'\/spaces\/new'/.test(proxy)) bad.push('proxy.ts still walls /spaces/new behind sign-in')
const doorSet = proxy.match(/CREATE_SPACE_DOORS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ''
for (const route of ['/spaces/new', '/launch']) if (!doorSet.includes(`'${route}'`)) bad.push(`proxy.ts does not send a signed-out ${route} to the wizard`)
if (doorSet.includes("'/launch/start'")) bad.push('proxy.ts still hops the Free Spotlight buttons to the wizard (owner 2026-11-13: they open the Spotlight builder)')
if (!/inFlowHref\('\/launch\/step\/spotlight'\)/.test(read('app/(main)/launch/start/route.ts'))) bad.push('a signed-out /launch/start does not open the Spotlight step')
if (!/CREATE_SPACE_WIZARD = '\/create-a-space'/.test(proxy) || !/!user && CREATE_SPACE_DOORS\.has\(pathname\.replace\(/.test(proxy)) bad.push('proxy.ts does not make the signed-out hop to /create-a-space')

// Other operator doors still open the wizard, never the member sign-up.
const spacesPage = read('components/frequency/site/pages/spaces/frequency-spaces.tsx')
if (/SITE\.join/.test(spacesPage)) bad.push('the /spaces page still sends an operator to /join')
if (!/href: ROUTES\.createSpace, label: 'Open your Space'/.test(read('lib/frequency/site-pages.ts'))) bad.push('the Spaces header CTA does not open the wizard')
if (!/href: SITE\.createSpace, icon: 'space', title: 'Open your Space'/.test(read('components/frequency/site/pages/home/frequency-home.tsx'))) bad.push('the home Open your Space card does not open the wizard')
if (!/if \(opts\.signedIn === false\) return WIZARD/.test(read('lib/launch/destination.ts')) || !/const WIZARD = '\/create-a-space'/.test(read('lib/launch/destination.ts'))) bad.push('launchHomeHref still sends a visitor to the Spotlight form')

// The operator CTA and /for doors remain Create a Space entry points. The retired /go campaign doors use their closest survivors.
if (!/OPERATOR_CTA_HREF = "\/spaces\/new"/.test(site)) bad.push('the operator CTA no longer opens /spaces/new')
if (!/return `\/spaces\/new\?mode=\$\{mode\.type\}:\$\{mode\.variant\}`/.test(forDoors)) bad.push('the /for doors no longer open /spaces/new')
for (const [source, destination] of [
  ['/go/calm-down-fast', '/mindless'],
  ['/go/find-your-people', '/events'],
  ['/go/host-one-circle', '/create-a-space'],
  ['/go/bring-your-practice', '/create-a-space'],
  ['/go/run-it-together', '/create-a-space'],
  ['/go/:path*', '/create-a-space'],
]) {
  const entry = `{ source: '${source}', destination: '${destination}', permanent: true }`
  if (!config.includes(entry)) bad.push(`${source} must permanently redirect to ${destination}`)
}
const retiredDoor = ['app', '(marketing)', 'go', '[door]', 'page.tsx'].join('/')
if (existsSync(retiredDoor)) bad.push('the retired campaign page still exists')

// The builder still starts from surviving door hints, and the niche rides to the launch hold.
if (!/doorArrival\(\(k\) => params\.get\(k\)\)/.test(studio) || !/goals: arrival\.goals, niche: arrival\.niche/.test(studio)) bad.push('the studio does not start from the door\'s hints')
if (!/niche: draft\.niche/.test(handoff)) bad.push('the niche does not ride to the launch hold')
for (const key of ['kit', 'theme', 'mode', 'intents', 'niche', 'name']) if (!door.includes(`'${key}'`)) bad.push(`the door rule does not read ${key}`)

// The rule's own tests walk the live door contract under Vitest.
const test = read('lib/create-space/door.test.ts')
for (const need of ['NICHE_FUNNEL_DESTINATIONS', 'OPERATOR_CTA_HREF', 'operatorStartHref']) if (!test.includes(need)) bad.push(`door.test.ts does not walk ${need}`)

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('LIVE-1969: create-space doors retain wizard wiring and retired /go doors permanently redirect to survivors')
