#!/usr/bin/env node
// PASS 2a of the type-literal sweep — the half pass 1 could not reach.
//
// Pass 1 walked className ATTRIBUTES, so it only ever saw plain string classNames. Three
// populations survived it, all of them mechanical:
//
//   1. `className={`...`}` template literals (404 sites) — the attribute walker stopped at
//      the first `}`, which inside a template literal is an interpolation, not the end of
//      the attribute. That is the same bug that corrupted two files in pass 1.
//   2. components/page-editor/** + lib/page-editor/** (~217) — held out of pass 1's ratchet.
//   3. `text-lg` (225) — had nowhere to land until --text-body-lg was added for it.
//
// TECHNIQUE, and why it differs from pass 1: this does NOT parse attributes at all. It
// substitutes bare class TOKENS over the whole file. That sidesteps the `}`-in-template-
// literal trap by construction rather than by a smarter regex, and it is idempotent —
// none of the six inputs appears as a \b-delimited token inside any of the six outputs,
// so a second run is a no-op.
//
// Every mapping is exact-value: same rem, same Tailwind line-height ratio. Zero pixel
// change at --type-scale: 1, which is the default and the only value in the shipped presets
// that the sweep is allowed to assume. Verified by compiling both sides before any call
// site moved (see app/globals.css, the PAIRED LINE-HEIGHTS note).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'components', 'lib']

/** Literal → role. Exact same computed value; the role additionally rides --type-scale. */
const MAP = {
  'text-xs': 'text-meta',
  'text-sm': 'text-body-sm',
  'text-base': 'text-body',
  'text-lg': 'text-body-lg',
  'text-xl': 'text-lead',
  'text-2xl': 'text-page-title',
}

const PATTERN = new RegExp(`\\b(${Object.keys(MAP).join('|')})\\b`, 'g')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const apply = process.argv.includes('--apply')
let files = 0
let hits = 0

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    const matches = src.match(PATTERN)
    if (!matches) continue
    files += 1
    hits += matches.length
    if (apply) writeFileSync(file, src.replace(PATTERN, (m) => MAP[m]))
  }
}

console.log(
  `${apply ? 'Rewrote' : 'Would rewrite'} ${hits} literal(s) across ${files} file(s).`,
)
if (!apply) console.log('Dry run. Pass --apply to write.')
