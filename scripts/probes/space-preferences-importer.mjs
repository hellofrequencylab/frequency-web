#!/usr/bin/env node
// LIVE-2351: the business importer (lib/importer/materialize.ts writeProfileDataAndLayout) writes only the
// spaces.preferences keys a seed changes, through preferencesPatch + patchSpacePreferences
// (set_space_preferences, service_role, the admin client the importer already runs as), so a re-seed cannot
// turn back a key another console saved meanwhile (a just-published Spotlight). Reads source with comments
// stripped. Exit 1 (FAIL) while the file still replaces the whole preferences blob.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILE = 'lib/importer/materialize.ts'
if (!existsSync(new URL(FILE, root))) {
  console.error(`${FILE} missing (re-check this probe)`)
  process.exit(2)
}
const src = read(FILE)
const fails = []
if (/\.update\(\s*\{\s*preferences\b/.test(src)) fails.push(`${FILE} still writes the whole spaces.preferences blob (.update({ preferences }))`)
const start = src.indexOf('async function writeProfileDataAndLayout(')
if (start < 0) {
  console.error(`${FILE} no longer defines writeProfileDataAndLayout (re-check this probe)`)
  process.exit(2)
}
const fn = src.slice(start, src.indexOf('\n}\n', start))
if (!/preferencesPatch\(/.test(fn) || !/patchSpacePreferences\(/.test(fn)) {
  fails.push(`${FILE} writeProfileDataAndLayout does not send a key-scoped patch (preferencesPatch + patchSpacePreferences)`)
}

if (fails.length) {
  console.error(`LIVE-2351 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2351 ok: the business importer sends only the preference keys a seed changes')
