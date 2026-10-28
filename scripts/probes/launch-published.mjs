#!/usr/bin/env node
// VLS-09: a step ends on its published screen, which links to the real page the person made and offers the next step;
// a step that is not published sends them back to it. The links and the next step are pinned by
// lib/launch/published.test.ts (run first by the row's command); this reads the wiring.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const page = read('app/(main)/launch/step/[step]/published/page.tsx')
const screen = read('components/launch/published-screen.tsx')
const actions = read('lib/launch/actions.ts')

if (!/launchSystemEnabled\(\)\) notFound\(\)/.test(page)) bad.push('the published page opens while the launch is off')
if (!/if \(!profileId\) redirect\('\/sign-in'\)/.test(page)) bad.push('the published page answers someone signed out')
if (!/view\.kind === 'not_yet'\) redirect\(launchStepHref\(step\)\)/.test(page)) bad.push('an unpublished step does not send the person back to it')
if (!/view\.next/.test(screen) || !/view\.liveHref/.test(screen)) bad.push('the screen is missing the next-step button or the link to what was made')
if (!/redirect\(launchStepPublishedHref\('spotlight'\)\)/.test(actions)) bad.push('the Spotlight step does not end on its published screen')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ a published step lands on its screen with the next step and a link to what was made')
