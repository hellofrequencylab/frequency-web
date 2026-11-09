#!/usr/bin/env node
// LIVE-1969: every signed-out way into creating a Space opens the /create-a-space wizard, primed with what the door
// knew; a signed-in member still lands on the launch. No door gets a second destination: they all still point at
// /spaces/new, and that page sends a visitor with no account on to the wizard instead of /sign-in.
//
// The door rule (lib/create-space/door.ts) imports the catalogs through the `@/` alias, so the rule itself is proven
// under vitest (lib/create-space/door.test.ts walks the real doors: the /go doors, the /for doors' Space-create paths,
// the operator CTA, the pricing hand-off; CI's test job runs it). A probe may not spawn a test runner (LIVE-034), so
// this one reads the page, the studio, the rule and the doors for the wiring, and checks the test file is there.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const page = read('app/(main)/spaces/new/page.tsx')
const studio = read('components/frequency/site/pages/create-space/create-space-studio.tsx')
const door = read('lib/create-space/door.ts')
const handoff = read('lib/create-space/handoff.ts')
const site = read('lib/site.ts')
const goDoors = read('lib/marketing/launch-doors.ts')
const forDoors = read('lib/funnels/definitions.ts')

// The page: signed out goes to the wizard, never to sign-in first; signed in still goes to the launch.
if (!/if \(!profileId\) redirect\(createSpaceDoorHref\(params\)\)/.test(page)) bad.push('a signed-out arrival at /spaces/new is not sent to /create-a-space')
if (/\/sign-in\?next=/.test(page)) bad.push('/spaces/new still bounces a visitor to /sign-in')
if (!/launchHomeHref\(\{ signedIn: true \}\)/.test(page) || !/\/launch\/start/.test(page)) bad.push('a signed-in member no longer lands on the launch')
// The proxy makes the same hop before the (main) layout can bounce a visitor home; /spaces/new is no longer a
// session route there (it was the sign-in wall the page's own redirect never got past).
const proxy = read('proxy.ts')
if (/SESSION_ROUTES = new Set\(\[[^\]]*'\/spaces\/new'/.test(proxy)) bad.push('proxy.ts still walls /spaces/new behind sign-in')
const doorSet = proxy.match(/CREATE_SPACE_DOORS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ''
for (const door of ['/spaces/new', '/launch', '/launch/start']) if (!doorSet.includes(`'${door}'`)) bad.push(`proxy.ts does not send a signed-out ${door} to the wizard`)
if (!/CREATE_SPACE_WIZARD = '\/create-a-space'/.test(proxy) || !/!user && CREATE_SPACE_DOORS\.has\(pathname\.replace\(\/\\\/\$\/, ''\)\)/.test(proxy)) bad.push('proxy.ts does not make the signed-out hop to /create-a-space')
// The other operator doors (owner 2026-11-02): the /spaces page, the home cards and the Spaces header CTA open the
// wizard, never the member sign-up; a cold /launch for a visitor resolves to the wizard too.
const spacesPage = read('components/frequency/site/pages/spaces/frequency-spaces.tsx')
if (/SITE\.join/.test(spacesPage)) bad.push('the /spaces page still sends an operator to /join')
if (!/href: ROUTES\.createSpace, label: 'Open your Space'/.test(read('lib/frequency/site-pages.ts'))) bad.push('the Spaces header CTA does not open the wizard')
if (!/href: SITE\.createSpace, icon: 'space', title: 'Open your Space'/.test(read('components/frequency/site/pages/home/frequency-home.tsx'))) bad.push('the home Open your Space card does not open the wizard')
if (!/if \(opts\.signedIn === false\) return WIZARD/.test(read('lib/launch/destination.ts')) || !/const WIZARD = '\/create-a-space'/.test(read('lib/launch/destination.ts'))) bad.push('launchHomeHref still sends a visitor to the Spotlight form')

// The doors did not move: they all still open /spaces/new.
if (!/OPERATOR_CTA_HREF = "\/spaces\/new"/.test(site)) bad.push('the operator CTA no longer opens /spaces/new')
if ((goDoors.match(/buttonHref: '\/spaces\/new\?mode=/g) ?? []).length < 2) bad.push('the /go doors to a Space no longer open /spaces/new')
if (!/return `\/spaces\/new\?mode=\$\{mode\.type\}:\$\{mode\.variant\}`/.test(forDoors)) bad.push('the /for doors no longer open /spaces/new')

// The builder starts from the door's hints, and the niche rides to the launch.
if (!/doorArrival\(\(k\) => params\.get\(k\)\)/.test(studio) || !/goals: arrival\.goals, niche: arrival\.niche/.test(studio)) bad.push('the studio does not start from the door\'s hints')
if (!/niche: draft\.niche/.test(handoff)) bad.push('the niche does not ride to the launch hold')
for (const key of ['kit', 'theme', 'mode', 'intents', 'niche', 'name']) if (!door.includes(`'${key}'`)) bad.push(`the door rule does not read ${key}`)

// The rule's own tests walk the real doors under vitest; they must exist and name them.
const test = read('lib/create-space/door.test.ts')
for (const need of ['LAUNCH_DOORS', 'NICHE_FUNNEL_DESTINATIONS', 'OPERATOR_CTA_HREF', 'operatorStartHref']) if (!test.includes(need)) bad.push(`door.test.ts does not walk ${need}`)

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ create a space doors: every door still opens /spaces/new; signed out it opens /create-a-space primed with the door\'s kit, mode, niche and name, signed in it opens the launch')
