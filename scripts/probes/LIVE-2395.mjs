#!/usr/bin/env node
// The door, the save and the reveal sit in the same room as the running timer.
// Fails while: the save or a failed save is a bare line of text, the reveal ignores which timer
// just ended, the door does not say when the session would end, or any of them lacks the orb's light.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const room = read('components/on-air/stage-room.tsx')
if (!/export function RoomWash\(/.test(room)) fails.push('there is no shared room light (components/on-air/stage-room.tsx)')
if (!/export function useDoneBy\(/.test(room)) fails.push('nothing works out when a session would end')
if (/from '\.\/live-stage'/.test(room)) fails.push('the room pulls the running screen into the door')

const stage = read('components/on-air/live-stage.tsx')
if (!/export function StageNotice\(/.test(stage)) fails.push('there is no shared save / failed-save screen')

for (const [file, name] of [['components/on-air/session.tsx', 'Be Still'], ['components/on-air/movement-session.tsx', 'Get Moving']]) {
  const src = read(file)
  if ((src.match(/<StageNotice\b/g) ?? []).length < 2) fails.push(`${name} does not show its save and its failed save on the orb`)
  if (/function CenterScreen\(/.test(src)) fails.push(`${name} still has the bare centred screen`)
  if (!/<Reveal payload=\{payload\} mode="(still|move)"/.test(src)) fails.push(`${name} does not tell the reveal which timer ended`)
}

const reveal = read('components/on-air/reveal.tsx')
if (!/<RoomWash\b/.test(reveal)) fails.push('the reveal is not lit by the orb')
if (/text-5xl|text-6xl/.test(reveal)) fails.push('the reveal numbers are not in the display type')

const door = read('components/on-air/compact-setup.tsx')
if ((door.match(/<RoomWash\b/g) ?? []).length < 2) fails.push('the door (sheet and dialog) is not lit by the orb')
if ((door.match(/Done by \{doneBy\}/g) ?? []).length < 2) fails.push('the door does not say when the session would end')
if (/from '\.\/live-stage'/.test(door)) fails.push('the door imports the running screen')

if (fails.length) {
  console.log(`FAIL LIVE-2395\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2395')
