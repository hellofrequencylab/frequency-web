#!/usr/bin/env node
// SCAN-1287: room and night imagery that the SCAN-1286 probe's fixed phrases let through. The voice
// guide (section 9a) bans rooms and nights as a metaphor for success or belonging, and "the people in
// the room" as a stand-in for "your people". The deep audit of 2026-11-19 still found "You hold the
// room", "Find the room that meets again" (every /for comparison), "keep the rooms going",
// "Supporters keep the rooms booked", "The nights every group comes to", "The room is built by...",
// "Notes from the room", "help shape the room", "a night out", "the new night out" and "The rooms
// are filling". Fails while any of those comes back on a surface a person reads.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BANNED = [
  /\byou hold the room\b/i,
  /\bfind the room that\b/i,
  /\bkeeps? the rooms (going|booked)\b/i,
  /\bthe nights every\b/i,
  /\bthe room is built\b/i,
  /\bnotes from the room\b/i,
  /\bshape the room\b/i,
  /\bjoin the room, not\b/i,
  /\b(a|the new) night out\b/i,
  /\brooms are filling\b/i,
  /\bstays about the people in the room\b/i,
]
const ROOTS = ['lib', 'components', 'app', 'content']
const EXT = /\.(ts|tsx|md|mdx)$/
function* walk(dir) {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile() && EXT.test(p) && !/\.test\.tsx?$/.test(p)) yield p
  }
}
const hits = []
for (const root of ROOTS) for (const file of walk(root)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    for (const re of BANNED) if (re.test(line)) hits.push(`${file}:${i + 1} ${line.match(re)[0]}`)
  })
}
if (hits.length) {
  console.error(`SCAN-1287 FAIL: ${hits.length} room or night metaphor(s) still on a surface a person reads (voice guide 9a):\n  ${hits.join('\n  ')}`)
  process.exit(1)
}
console.log('SCAN-1287 ok: no room or night metaphors past the SCAN-1286 list')
