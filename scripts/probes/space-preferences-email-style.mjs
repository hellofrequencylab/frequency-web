#!/usr/bin/env node
// LIVE-2350: the Space email style editor (lib/spaces/email-style-actions.ts) writes only the
// spaces.preferences key it changes (emailStyle), through preferencesPatch + patchSpacePreferences
// (set_space_preferences), so a save there cannot turn back a key another console saved meanwhile (a
// just-published Spotlight). Reads source with comments stripped. Exit 1 (FAIL) while the file still
// replaces the whole preferences blob.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILE = 'lib/spaces/email-style-actions.ts'
if (!existsSync(new URL(FILE, root))) {
  console.error(`${FILE} missing (re-check this probe)`)
  process.exit(2)
}
const src = read(FILE)
const fails = []
if (/\.update\(\s*\{\s*preferences\b/.test(src)) fails.push(`${FILE} still writes the whole spaces.preferences blob (.update({ preferences }))`)
const start = src.indexOf('export async function setSpaceEmailStyle(')
if (start < 0) {
  console.error(`${FILE} no longer exports setSpaceEmailStyle (re-check this probe)`)
  process.exit(2)
}
const action = src.slice(start, src.indexOf('\n}\n', start))
if (!/preferencesPatch\(/.test(action) || !/patchSpacePreferences\(/.test(action)) {
  fails.push(`${FILE} setSpaceEmailStyle does not send a key-scoped patch (preferencesPatch + patchSpacePreferences)`)
}

if (fails.length) {
  console.error(`LIVE-2350 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2350 ok: the Space email style editor sends only the preference key it changes')
