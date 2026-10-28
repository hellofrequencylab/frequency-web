#!/usr/bin/env node
// VLS-30: the Vera launch ships dark, behind two envFlag switches listed blank in .env.example.
//
// Fails when an unset switch turns the launch or its public doorway on, when the doorway opens while the
// launch is off, when a switch stops reading envFlag spellings, or when .env.example or RUNBOOKS lose either.
import { readFileSync } from 'node:fs'
import { launchEntryEnabled, launchSystemEnabled } from '../../lib/launch/enabled.ts'

const bad = []
const set = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }

set('LAUNCH_SYSTEM_ENABLED'); set('LAUNCH_ENTRY_ENABLED')
if (launchSystemEnabled() || launchEntryEnabled()) bad.push('unset switches turn the launch on')
set('LAUNCH_ENTRY_ENABLED', '1')
if (launchEntryEnabled()) bad.push('the doorway opens while the launch is off')
set('LAUNCH_SYSTEM_ENABLED', 'on')
if (!launchSystemEnabled() || !launchEntryEnabled()) bad.push('on does not turn both on')
set('LAUNCH_SYSTEM_ENABLED', 'yes')
if (launchSystemEnabled()) bad.push('yes reads as on, not envFlag spelling')

const env = readFileSync('.env.example', 'utf8')
const runbooks = readFileSync('docs/RUNBOOKS.md', 'utf8')
for (const k of ['LAUNCH_SYSTEM_ENABLED', 'LAUNCH_ENTRY_ENABLED']) {
  if (!new RegExp(`^${k}=$`, 'm').test(env)) bad.push(`${k} is not listed blank in .env.example`)
  if (!runbooks.includes(k)) bad.push(`${k} has no activation gate in RUNBOOKS`)
}

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('The Vera launch is dark until LAUNCH_SYSTEM_ENABLED is on, and the public doorway needs LAUNCH_ENTRY_ENABLED too.')
