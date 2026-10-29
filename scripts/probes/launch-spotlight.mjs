#!/usr/bin/env node
// VLS-07: the Spotlight step. A visitor with a name, one line and one link ends with a free Space whose Space
// Spotlight is published with their own words, and no account is asked for before Publish.
//
// The answers, the handle and the published preferences are pinned by lib/launch/spotlight-step.test.ts (run first
// by the row's command). This reads the source for the wiring: the start route and the step page are dark while the
// launch is off, a signed-out Publish holds the answers and sends the visitor to sign in, a signed-in one makes the
// Space through the shared provisioning and records the step.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const start = read('app/(main)/launch/start/route.ts')
const page = read('app/(main)/launch/step/spotlight/page.tsx')
const actions = read('lib/launch/actions.ts')
const io = read('lib/launch/spotlight-io.ts')

if (!/launchSystemEnabled\(\)\) notFound\(\)/.test(start) || !/launchSystemEnabled\(\)\) notFound\(\)/.test(page)) bad.push('the start route or the step page opens while the launch is off')
if (!/if \(!profileId\) \{[\s\S]*writePendingLaunch[\s\S]*redirect\(launchHomeHref\(\{ signedIn: false \}\)\)/.test(start)) bad.push('a signed-out visitor is not held and sent to the step by /launch/start')
if (/redirect\('\/sign-in/.test(start)) bad.push('/launch/start asks for an account before Publish')
if (!/if \(!profileId\) \{[\s\S]*writePendingLaunch[\s\S]*\/sign-in\?next=\/launch\/claim/.test(actions)) bad.push('a signed-out Publish does not hold the answers and send the visitor to sign in')
if (!/publishSpotlightStep\(profileId, launch, answers[,)]/.test(actions)) bad.push('a signed-in Publish does not run the step')
if (!/await createSpace\(input\)/.test(io) || !/publishedSpotlightPreferences\(/.test(io) || !/markStepPublished\(launch, 'spotlight'/.test(io)) bad.push('the step does not make the Space, publish the Spotlight and record the step')
if (!/launch\.spaceId \? await getSpaceById/.test(io)) bad.push('a second Publish would make a second Space')
if (!/isRedirectError\(err\)/.test(io)) bad.push('the step does not treat createSpace\'s redirect as success')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the Spotlight step makes the free Space and publishes the Space Spotlight; no account is asked for before Publish')
