#!/usr/bin/env node
// SCAN-1286: "full room" copy. Owner ask 2026-11-19: phrases like "full room", "people who fill a
// room" and "full nights" read as cheesy. The imagery was seeded by the messaging manifesto
// ("A network of rooms and the people who fill them. Nights that run late."), the brand one-liner
// ("the people looking to fill them") and the core-model definition ("Event: when the room is
// open"), then copied into templates, kits, nav and help. This probe holds both halves:
//   1. the sources that teach the voice carry the banned list (the guide and the AI primer), and
//   2. no copy a person reads still uses the imagery.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BANNED = [
  /\bfill(s|ed|ing)? (up )?(a|the|your|their|this|that|our) (room|rooms|night|nights|hall|seats|calendar)\b/i,
  /\b(full|packed|half-full|fuller) (room|rooms|night|nights|house)\b/i,
  /\brooms? full of\b/i,
  /\b(this|the|a|your) room fills\b/i,
  /\bpeople (who|that) fill\b/i,
  /\blooking to fill them\b/i,
  /\bnights that run late\b/i,
  /\bkeep the room\b/i,
  /\b(after|then) a (good|great) night\b/i,
  /\bgood nights need\b/i,
  /\bwhen the room is open\b/i,
  /\bnetwork of rooms\b/i,
]

// 1. The sources carry the list.
const guide = readFileSync('docs/marketing/voice-and-language-guide.md', 'utf8')
const primer = readFileSync('lib/ai/voice.ts', 'utf8')
const missing = []
if (!/## 9a\. Banned imagery/.test(guide)) missing.push('voice guide has no "9a. Banned imagery" section')
if (!/full room/.test(primer) || !/people who fill/.test(primer)) missing.push('VOICE_PRIMER does not ban the room imagery')
if (missing.length) { console.error(missing.join('\n')); process.exit(1) }

// 2. The copy is clean. The guide's own banned list is the one place the phrases may appear.
const ROOTS = [
  'lib/page-editor/templates', 'lib/sites', 'lib/marketing', 'lib/nav', 'lib/spaces/modes.ts',
  'lib/funnels', 'components/frequency/site', 'components/widgets', 'components/page-editor/blocks',
  'content/help', 'app/(brief)', 'scripts/render', 'design_handoff/frequency',
  'docs/CORE-MODEL.md', 'docs/GLOSSARY.md', 'docs/CONTENT-VOICE.md', 'docs/marketing',
]
const EXT = /\.(ts|tsx|md|mdx|html)$/
function* walk(p) {
  if (!existsSync(p)) return
  const s = statSync(p)
  if (s.isFile()) { if (EXT.test(p) && !/\.test\.tsx?$/.test(p)) yield p; return }
  for (const e of readdirSync(p)) yield* walk(join(p, e))
}
const hits = []
for (const root of ROOTS) for (const file of walk(root)) {
  let text = readFileSync(file, 'utf8')
  if (file === 'docs/marketing/voice-and-language-guide.md') {
    text = text.replace(/## 9a\. Banned imagery[\s\S]*?(?=\n## )/, '')
  }
  text.split('\n').forEach((line, i) => {
    if (BANNED.some(re => re.test(line))) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`)
  })
}
if (hits.length) { console.error(`Room imagery still in copy (${hits.length}):\n` + hits.join('\n')); process.exit(1) }
console.log('Voice guide and AI primer ban the room imagery, and no copy uses it')
