#!/usr/bin/env node
// The Zap menu wears the Claude Design Zap menu of 2026-11-18 (frame 2a).
// Fails while: the menu does not lead with the member's own code (held up on tap, with Share and
// Scan); there is no one-line post box; Open the timer, Check in and Log a practice are missing;
// Log a practice does not open the door on Just Log; or the prompt does not return the code.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const menu = read('components/feed/capture-launcher.tsx')
if (!/\/api\/qr\?code=/.test(menu)) fails.push('the menu does not show the member\'s real code')
if (!menu.includes("setView('held')") || !menu.includes('Hold it up and say hi.')) fails.push('tapping the code does not hold it up')
if (!menu.includes('Share my QR') || !menu.includes('Scan a QR') || !menu.includes('href="/scan"')) fails.push('the code has no Share and Scan')
if (!menu.includes('aria-label="Create a post"') || !/createPost\(/.test(menu)) fails.push('there is no one-line post box that posts in place')
if (!menu.includes('Open the timer')) fails.push('there is no Open the timer row')
if (!menu.includes('Check in') || !menu.includes('/scan?hint=checkin')) fails.push('there is no Check in tile')
if (!menu.includes('Log a practice') || !/justLog: true/.test(menu)) fails.push('Log a practice does not open the door on Just Log')
if (/\/events\/scan|\/connections\/new|Ghost Node/.test(menu)) fails.push('the old six-tile grid is still in the menu')

const mindless = read('components/on-air/mindless.tsx')
if (!/justLog\?: boolean/.test(mindless) || !/startOnLog=\{state\.justLog\}/.test(mindless)) fails.push('the timer does not take a Just Log open')
const door = read('components/on-air/compact-setup.tsx')
if (!/startOnLog/.test(door) || !/stillPick: 'log'/.test(door)) fails.push('the door does not open on Free Practice, Just Log')

const route = read('app/api/zap-prompt/route.ts')
if (!/purpose', 'connect'/.test(route) || !/code, me/.test(route)) fails.push('the Zap prompt does not return the member\'s code')

const code = menu.replace(/\/\/.*$/gm, '')
if (/--fq-/.test(code) || /#[0-9a-fA-F]{3,8}\b/.test(code)) fails.push('the menu names a raw colour or a kit token')

if (fails.length) {
  console.log(`FAIL LIVE-2425\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2425')
