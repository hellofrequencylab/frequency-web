#!/usr/bin/env node
// Be Still and Get Moving run on one live stage built from the door's orb.
// Fails while: there is no shared live stage, either engine still draws its own running screen
// (the grey clock, the ringed circle), the stage has no progress ring, no end time, no quiet
// mode or no pause key.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const stage = read('components/on-air/live-stage.tsx')
if (!/export function LiveStage\(/.test(stage)) fails.push('there is no shared live stage (components/on-air/live-stage.tsx)')
if (!/strokeDashoffset/.test(stage)) fails.push('the stage has no ring that fills with the session')
if (!/Ends \{endsAt\}/.test(stage)) fails.push('the stage does not say when the session ends')
if (!/QUIET_AFTER_MS/.test(stage) || !/data-quiet/.test(stage)) fails.push('the chrome never steps back during a running session')
if (!/e\.code !== 'Space'/.test(stage)) fails.push('Space does not pause')
if (!/motion-reduce:/.test(stage) || !/prefers-reduced-motion/.test(stage)) fails.push('the stage does not honour reduced motion')
if (/#[0-9a-fA-F]{3,8}\b/.test(stage.replace(/\/\/.*$/gm, ''))) fails.push('the stage names a raw colour instead of a token')

for (const [file, name] of [['components/on-air/session.tsx', 'Be Still'], ['components/on-air/movement-session.tsx', 'Get Moving']]) {
  const src = read(file)
  if (!/<LiveStage\b/.test(src)) fails.push(`${name} does not run on the live stage`)
  if (/text-8xl|h-56 w-56/.test(src.slice(src.indexOf("if (stage === 'live') {")).split('// setup')[0])) fails.push(`${name} still draws its own running clock`)
}

if (fails.length) {
  console.log(`FAIL LIVE-2393\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2393')
