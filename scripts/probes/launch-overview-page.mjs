#!/usr/bin/env node
// /launch is the one page: it reads what the account already has and shows it ticked, with a progress ring and a bar
// per section. lib/launch/inventory.test.ts and overview.test.ts pin the rules; this reads the wiring.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const page = read('app/(main)/launch/page.tsx')
const io = read('lib/launch/inventory-io.ts')
const view = read('components/launch/launch-overview.tsx')

if (!/loadInventory\(/.test(page) || !/<LaunchOverview/.test(page)) bad.push('the /launch page does not show the inventory')
if (!/loadLaunchRows\(/.test(io) || !/getSpaceById\(/.test(io)) bad.push('the inventory does not read the Space and its rows')
if (!/overviewProgress\(/.test(view) || !/var\(--fq-accent\)/.test(view)) bad.push('the overview does not draw the progress graph from the model')
if (/#[0-9a-fA-F]{3,8}\b/.test(view)) bad.push('the overview hardcodes a color')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ /launch shows what the account already has, ticked, with progress')
