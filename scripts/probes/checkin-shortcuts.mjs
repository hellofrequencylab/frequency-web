// LIVE-1177 probe: Check in is one tap from the console, not a search: a sidebar row (the phone More sheet
// lists it too) and a button on the console Home.
//
//   node scripts/probes/checkin-shortcuts.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nav = readFileSync('components/frequency/admin/space-console.tsx', 'utf8')
assert.match(nav, /key: 'checkin', label: 'Check in'/, 'the sidebar has a Check in row')
const home = readFileSync('components/frequency/admin/pages/overview/overview-body.tsx', 'utf8')
assert.match(home, /offerings\?tab=checkin/, 'the console Home links to the Check in tab')
assert.match(home, /Check in\n/, 'the Home button is named Check in')
console.log('PASS checkin-shortcuts')
