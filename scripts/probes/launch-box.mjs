#!/usr/bin/env node
// VLS-08: the launch box sits in the members header, has no dismiss control, and stopping takes two steps.
//
// Runs lib/launch/box-state.ts under node and reads the box's source. Fails when the header stops mounting
// the box, when the shell mounts it while the launch is switched off, when a control that dismisses it
// appears, when the stop form can be reached without the request call, or when the box CSS reaches for a raw colour.
import { readFileSync } from 'node:fs'
import { boxView } from '../../lib/launch/box-state.ts'
import { toSnapshot } from '../../lib/launch/state.ts'

const bad = []
const header = readFileSync('components/frequency/members/shell/header.tsx', 'utf8')
const shell = readFileSync('components/frequency/members/shell/members-shell.tsx', 'utf8')
const box = readFileSync('components/frequency/members/shell/launch-box.tsx', 'utf8')
const css = readFileSync('app/themes/frequency/members-shell.css', 'utf8')

if (!header.includes("import { LaunchPill, LaunchSheet } from './launch-box'")) bad.push('the header does not mount the launch box')
if (!/launchSystemEnabled\(\) \? loadLaunchBox\(\) : undefined/.test(shell)) bad.push('the shell loads the box while the launch is off')
if (/aria-label="(dismiss|close)|>\s*(dismiss|close|hide)\s*</i.test(box)) bad.push('the launch box has a dismiss control')
if (!/requestCancelAction/.test(box) || !/confirmCancelAction\(typed\)/.test(box)) bad.push('stopping is not two calls with the typed word')
if (!/\{asked && \(\s*<form/.test(box)) bad.push('the typed-word form shows before a stop was asked for')
const launchCss = css.slice(css.indexOf('The Vera launch box'))
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(launchCss)) bad.push('the launch box CSS uses a raw colour')

const t0 = new Date('2026-10-28T12:00:00Z')
const v = boxView(toSnapshot({ id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: t0.toISOString(), niche: 'coaches', steps: {} }), t0)
if (v.total !== 9 || v.stages.length !== 3 || v.current?.id !== 'spotlight') bad.push('a new launch does not read as nine steps with the Spotlight next')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the launch box is mounted, dismiss-free, two-step to stop, and tokened')
