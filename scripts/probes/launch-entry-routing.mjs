#!/usr/bin/env node
// LIVE-1871: every way into the launch lands on /launch. Runs lib/launch/destination.ts under node and reads the
// entries' source. Fails when an entry builds its own address instead of asking the helper, when the Spotlight step
// stops sending a started launch home (or when the launch page's own links stop marking the flow, which would
// loop), when /launch can be a dead end, or when the pending-launch hold's contract changed.
import { readFileSync } from 'node:fs'
import { inFlowHref, launchHomeHref, spotlightArrivalGoesHome } from '../../lib/launch/destination.ts'

const bad = []
const src = (p) => readFileSync(p, 'utf8')
const must = (name, text, re) => { if (!re.test(text)) bad.push(name) }
const mustNot = (name, text, re) => { if (re.test(text)) bad.push(name) }

if (launchHomeHref({ signedIn: true }) !== '/launch') bad.push('a signed-in member does not land on /launch')
if (launchHomeHref({ signedIn: false }) !== '/launch/step/spotlight') bad.push('a visitor is not held by the Spotlight form')
if (launchHomeHref({ signedIn: true, lid: 'a&b' }) !== '/launch') bad.push('the helper lets text into the address')
if (!spotlightArrivalGoesHome({ hasLaunch: true }) || spotlightArrivalGoesHome({ hasLaunch: true, go: '1' })) bad.push('the cold-arrival rule is wrong')
if (inFlowHref('/launch/step/spotlight') !== '/launch/step/spotlight?go=1') bad.push('inFlowHref does not mark the step')

const start = src('app/(main)/launch/start/route.ts')
const claim = src('app/(main)/launch/claim/route.ts')
const resume = src('app/(main)/launch/resume/route.ts')
const page = src('app/(main)/launch/page.tsx')
const step = src('app/(main)/launch/step/spotlight/page.tsx')
const spacesNew = src('app/(main)/spaces/new/page.tsx')
const box = src('components/frequency/members/shell/launch-box.tsx')
const pending = src('lib/launch/pending.ts')

for (const [n, t] of [['start', start], ['claim', claim], ['resume', resume], ['launch box', box], ['/spaces/new', spacesNew], ['spotlight step', step]]) {
  must(`${n} does not ask launchHomeHref`, t, /launchHomeHref/)
}
mustNot('/launch/start still redirects to the step', start, /launchStepHref/)
mustNot('/launch/claim still redirects to /launch/resume', claim, /redirect\('\/launch\/resume'\)/)
mustNot('the launch box still links /launch/resume', box, /'\/launch\/resume'/)
must('/launch does not start a launch when none exists', page, /startLaunch\(profileId/)
mustNot('/launch still ends on a bare empty state', page, /No launch yet/)
must('the launch page links its next step unmarked (it would loop)', page, /nextHref=\{inFlowHref\(view\.href\)\}/)
must('the Spotlight step does not send a started launch home', step, /spotlightArrivalGoesHome/)
must('/spaces/new does not check for a launch under way', spacesNew, /getActiveLaunch\(profileId\)/)
// The hold's contract is read, never changed here.
for (const k of ['PENDING_LAUNCH_COOKIE', 'parsePendingLaunch', 'serializePendingLaunch']) must(`pending.ts lost ${k}`, pending, new RegExp(k))

if (bad.length) { console.error(bad.map((b) => `x ${b}`).join('\n')); process.exit(1) }
console.log('ok: every launch entry asks one helper and lands on /launch; /launch starts a launch when none exists')
