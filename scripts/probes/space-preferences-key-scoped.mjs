#!/usr/bin/env node
// LIVE-2347: the Page panel (manage/layout/actions.ts) and the page editor (edit-page/actions.ts) write only
// the spaces.preferences keys they change, through patchSpacePreferences (set_space_preferences), so a save
// there cannot turn back a key another console saved meanwhile (a just-published Spotlight). Reads source
// with comments stripped. Exit 1 (FAIL) while either file still replaces the whole preferences blob.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILES = ['app/(main)/spaces/[slug]/manage/layout/actions.ts', 'app/(main)/spaces/[slug]/edit-page/actions.ts']
const fails = []
for (const f of FILES) {
  if (!existsSync(new URL(f, root))) {
    console.error(`${f} missing (re-check this probe)`)
    process.exit(2)
  }
  const src = read(f)
  if (/\.update\(\s*\{\s*preferences\b/.test(src)) fails.push(`${f} still writes the whole spaces.preferences blob (.update({ preferences }))`)
  const writer = src.slice(src.indexOf('async function writePreferences('), src.indexOf('\n}\n', src.indexOf('async function writePreferences(')))
  if (!/preferencesPatch\(/.test(writer) || !/patchSpacePreferences\(/.test(writer)) {
    fails.push(`${f} writePreferences does not send a key-scoped patch (preferencesPatch + patchSpacePreferences)`)
  }
}
const helper = existsSync(new URL('lib/spaces/preferences-patch.ts', root)) ? read('lib/spaces/preferences-patch.ts') : ''
if (!/export function preferencesPatch\(/.test(helper)) fails.push('lib/spaces/preferences-patch.ts no longer exports preferencesPatch')

if (fails.length) {
  console.error(`LIVE-2347 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2347 ok: the Page panel and page editor send only the preference keys they change')
