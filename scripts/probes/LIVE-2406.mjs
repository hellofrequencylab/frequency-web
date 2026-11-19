#!/usr/bin/env node
// The member timer wears the Claude Design timer of 2026-11-18 (direction A).
// Fails while: the phone door still opens on pickers and disclosure rows instead of length, style
// chips and one options link; the running screen still reads the time off a ring; the reveal still
// carries spot art; or the door, the stage or the reveal names a raw colour or a kit token.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const door = read('components/on-air/compact-setup.tsx')
const controls = read('components/on-air/door/sheet-controls.tsx')
if (!controls) fails.push('the phone door has no chip controls (components/on-air/door/sheet-controls.tsx)')
if (!/export function ChipGroup\b/.test(controls) || !/aria-pressed/.test(controls)) fails.push('a door choice is not a pressed chip')
if (!door.includes("'Practice, sound and options'") || !door.includes("'Fewer options'")) fails.push('practice, sound and the rest are not behind one link')
if (/togglePicker|<StillSections\b|<MoveSections\b/.test(door)) fails.push('the phone door still opens on pickers and disclosure rows')
if (!door.includes('aria-label="Continue or start fresh"') || !door.includes("'Start fresh'")) fails.push('a partial today does not offer Continue and Start fresh side by side')

const stage = read('components/on-air/live-stage.tsx')
if (!/data-live-bar/.test(stage)) fails.push('the running clock has no bar')
if (/<svg\b/.test(stage)) fails.push('the running screen still draws a ring')
if (!/data-rounds/.test(stage)) fails.push('a Get Moving plan does not say its round')

const reveal = read('components/on-air/reveal.tsx')
if (/reveal-art|Art className=/.test(reveal) || existsSync(new URL('components/on-air/reveal-art.tsx', root))) fails.push('the reveal still carries spot art')
if (!/aria-label=\{`Card \$\{panel \+ 1\} of 4`\}/.test(reveal)) fails.push('the reveal does not say which card is showing')

for (const [name, src] of [['door controls', controls], ['stage', stage], ['reveal', reveal]]) {
  const code = src.replace(/\/\/.*$/gm, '')
  if (/--fq-/.test(code)) fails.push(`the ${name} names a kit token instead of a semantic one`)
  if (/#[0-9a-fA-F]{3,8}\b/.test(code.replace(/#\{/g, ''))) fails.push(`the ${name} names a raw colour`)
}

if (fails.length) {
  console.log(`FAIL LIVE-2406\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2406')
