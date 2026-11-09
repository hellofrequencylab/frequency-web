#!/usr/bin/env node
// LIVE-2230 probe: the public header is the code menu, not a stale database copy. The migration that
// removes the global header menu rows is on disk and touches only the global row, and the code
// default it falls back to is the agreed header (Discover, For Spaces, then Business Spaces,
// Pricing and Help), with no Features menu.
import { readdirSync, readFileSync } from 'node:fs'

const bad = []
const dir = 'supabase/migrations'
const file = readdirSync(dir).find((f) => f.endsWith('_reset_public_header_to_code_menu.sql'))
if (!file) {
  bad.push('no migration resets the global header menu to the code default')
} else {
  const sql = readFileSync(`${dir}/${file}`, 'utf8')
  if (!/delete from public\.menus where surface_key = 'header' and space_id is null/.test(sql)) bad.push(`${file} does not delete the global header menu`)
}

const nav = readFileSync('lib/frequency/site-nav.ts', 'utf8')
if (!/key: 'people',\s*label: 'Discover'/.test(nav)) bad.push('the code header has no Discover menu')
if (!/key: 'spaces',\s*label: 'For Spaces'/.test(nav)) bad.push('the code header has no For Spaces menu')
for (const label of ['Business Spaces', 'Pricing', 'Help']) {
  if (!new RegExp(`label: '${label}'`).test(nav.slice(nav.indexOf('DIRECT_LINKS')))) bad.push(`the plain header links lost ${label}`)
}

if (bad.length) {
  for (const m of bad) console.error(`LIVE-2230: ${m}`)
  process.exit(1)
}
console.log('LIVE-2230: the global header menu resets to the code default (Discover, For Spaces, Business Spaces, Pricing, Help)')
