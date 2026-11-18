#!/usr/bin/env node
// LIVE-2347: the Page panel (manage/layout/actions.ts) and the page editor (edit-page/actions.ts) write only
// the spaces.preferences keys they change, through patchSpacePreferences (set_space_preferences), so a save
// there cannot turn back a key another console saved meanwhile (a just-published Spotlight). Reads source
// with comments stripped. Exit 1 (FAIL) while either file still replaces the whole preferences blob.
//
// LIVE-2348: `--row=LIVE-2348` checks the Space Shop storefront settings save
// (settings/shop/shop-actions.ts saveStorefrontSettingsAction) the same way. No argument = LIVE-2347.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Per row: the files to check, and the function in each whose body must send a key-scoped patch.
const ROWS = {
  'LIVE-2347': {
    files: {
      'app/(main)/spaces/[slug]/manage/layout/actions.ts': 'async function writePreferences(',
      'app/(main)/spaces/[slug]/edit-page/actions.ts': 'async function writePreferences(',
    },
    ok: 'the Page panel and page editor send only the preference keys they change',
  },
  'LIVE-2348': {
    files: {
      'app/(main)/spaces/[slug]/settings/shop/shop-actions.ts': 'export async function saveStorefrontSettingsAction(',
    },
    ok: 'the Space Shop storefront settings save sends only the preference keys it changes',
  },
}

const arg = process.argv.slice(2).find((a) => a.startsWith('--row='))
const rowId = arg ? arg.slice('--row='.length) : 'LIVE-2347'
const row = ROWS[rowId]
if (!row) {
  console.error(`unknown row ${rowId} (known: ${Object.keys(ROWS).join(', ')})`)
  process.exit(2)
}

const fails = []
for (const [f, fn] of Object.entries(row.files)) {
  if (!existsSync(new URL(f, root))) {
    console.error(`${f} missing (re-check this probe)`)
    process.exit(2)
  }
  const src = read(f)
  if (/\.update\(\s*\{\s*preferences\b/.test(src)) fails.push(`${f} still writes the whole spaces.preferences blob (.update({ preferences }))`)
  const start = src.indexOf(fn)
  if (start === -1) {
    console.error(`${f} has no ${fn} (re-check this probe)`)
    process.exit(2)
  }
  const writer = src.slice(start, src.indexOf('\n}\n', start))
  if (!/preferencesPatch\(/.test(writer) || !/patchSpacePreferences\(/.test(writer)) {
    fails.push(`${f} ${fn.slice(0, -1)} does not send a key-scoped patch (preferencesPatch + patchSpacePreferences)`)
  }
}
const helper = existsSync(new URL('lib/spaces/preferences-patch.ts', root)) ? read('lib/spaces/preferences-patch.ts') : ''
if (!/export function preferencesPatch\(/.test(helper)) fails.push('lib/spaces/preferences-patch.ts no longer exports preferencesPatch')

if (fails.length) {
  console.error(`${rowId} FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log(`${rowId} ok: ${row.ok}`)
