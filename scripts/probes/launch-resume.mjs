#!/usr/bin/env node
// VLS-10: GET /launch/resume?lid=<id> lands the owner on the stored cursor step, a stranger gets a 404, and a
// stopped launch shows the restart card.
//
// Runs lib/launch/resume.ts under node (the owner's landing and the stopped launch) and reads the route and page
// source (the 404 for a launch that is not theirs, the switch, the sign-in gate, the launch box's link).
import { readFileSync } from 'node:fs'
import { resumeView } from '../../lib/launch/resume.ts'
import { toSnapshot } from '../../lib/launch/state.ts'

const bad = []
const route = readFileSync('app/(main)/launch/resume/route.ts', 'utf8')
const page = readFileSync('app/(main)/launch/page.tsx', 'utf8')
const box = readFileSync('components/frequency/members/shell/launch-box.tsx', 'utf8')

if (!/launchSystemEnabled\(\)\) notFound\(\)/.test(route) || !/launchSystemEnabled\(\)\) notFound\(\)/.test(page)) bad.push('the resume route or page opens while the launch is off')
if (!/getLaunchForOwner\(profileId, lid\)/.test(route) || !/if \(!launch\) notFound\(\)/.test(route)) bad.push('a launch that is not the caller\'s does not 404 on the resume route')
if (!/if \(!launch && lid\) notFound\(\)/.test(page)) bad.push('a launch that is not the caller\'s does not 404 on the page')
if (!/if \(!profileId\) redirect\('\/sign-in'\)/.test(route)) bad.push('the resume route answers someone signed out')
if (!/\/launch\/resume/.test(box)) bad.push('the launch box does not link to the resume route')

const t0 = new Date('2026-10-28T12:00:00Z')
const base = { id: 'l1', owner_id: 'p1', niche: 'coaches', started_at: t0.toISOString(), updated_at: t0.toISOString() }
const owner = resumeView(toSnapshot({ ...base, steps: { spotlight: { status: 'published' } } }), t0)
if (owner.kind !== 'step' || owner.step !== 'space' || owner.href !== '/launch/step/space') bad.push('the owner does not land on the stored cursor step')
if (resumeView(toSnapshot({ ...base, cancelled_at: t0.toISOString() }), t0).kind !== 'restart') bad.push('a stopped launch does not show the restart card')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the owner resumes at the stored step, a stranger gets a 404, a stopped launch offers a restart')
