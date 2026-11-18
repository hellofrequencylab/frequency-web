#!/usr/bin/env node
// LIVE-2349: the Module Manager (manage/modules/actions.ts: the menu save and the starting-setup niche save)
// writes only the spaces.preferences keys it changes, through patchSpacePreferences (set_space_preferences),
// so a save there cannot turn back a key another console saved meanwhile (a just-published Spotlight).
// Reads source with comments stripped. Exit 1 (FAIL) while the file still replaces the whole preferences blob.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILE = 'app/(main)/spaces/[slug]/manage/modules/actions.ts'
if (!existsSync(new URL(FILE, root))) {
  console.error(`${FILE} missing (re-check this probe)`)
  process.exit(2)
}
const src = read(FILE)
const fails = []
if (/\.update\(\s*\{\s*preferences\b/.test(src)) fails.push(`${FILE} still writes the whole spaces.preferences blob (.update({ preferences }))`)
const start = src.indexOf('async function writePreferences(')
const writer = start < 0 ? '' : src.slice(start, src.indexOf('\n}\n', start))
if (!/preferencesPatch\(/.test(writer) || !/patchSpacePreferences\(/.test(writer)) {
  fails.push(`${FILE} has no writePreferences sending a key-scoped patch (preferencesPatch + patchSpacePreferences)`)
}
for (const fn of ['saveSpaceModuleMenu', 'chooseSpaceNiche']) {
  const at = src.indexOf(`export async function ${fn}(`)
  const body = at < 0 ? '' : src.slice(at, src.indexOf('\n}\n', at))
  if (!/writePreferences\(/.test(body)) fails.push(`${fn} does not save through writePreferences`)
}
const helper = existsSync(new URL('lib/spaces/preferences-patch.ts', root)) ? read('lib/spaces/preferences-patch.ts') : ''
if (!/export function preferencesPatch\(/.test(helper)) fails.push('lib/spaces/preferences-patch.ts no longer exports preferencesPatch')

if (fails.length) {
  console.error(`LIVE-2349 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2349 ok: the Module Manager sends only the preference keys it changes')
