#!/usr/bin/env node
// LIVE-2352: the library asset swap (lib/library/usage.ts swapLibraryAssetRefs) writes only the
// spaces.preferences keys it rewrites (pageDocs, puck, profileLayout, profileLayoutDraft), through
// preferencesPatch + the set_space_preferences RPC (SCAN-833, service_role, the admin client it already
// holds), so a swap cannot turn back a key another console saved meanwhile (a just-published Spotlight).
// Reads source with comments stripped. Exit 1 (FAIL) while the file still replaces the whole blob.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILE = 'lib/library/usage.ts'
if (!existsSync(new URL(FILE, root))) {
  console.error(`${FILE} missing (re-check this probe)`)
  process.exit(2)
}
const src = read(FILE)
const fails = []
if (/\.update\(\s*\{\s*preferences\b/.test(src)) fails.push(`${FILE} still writes the whole spaces.preferences blob (.update({ preferences }))`)
const start = src.indexOf('export async function swapLibraryAssetRefs(')
if (start < 0) {
  console.error(`${FILE} no longer exports swapLibraryAssetRefs (re-check this probe)`)
  process.exit(2)
}
const action = src.slice(start, src.indexOf('\n}\n', start))
if (!/preferencesPatch\(/.test(action) || !/\.rpc\(\s*'set_space_preferences'/.test(action)) {
  fails.push(`${FILE} swapLibraryAssetRefs does not send a key-scoped patch (preferencesPatch + set_space_preferences)`)
}

if (fails.length) {
  console.error(`LIVE-2352 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2352 ok: the library asset swap sends only the preference keys it rewrites')
