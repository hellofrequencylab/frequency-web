#!/usr/bin/env node
// LIVE-2369 probe: no Nocturne editor block is labelled Midnight (the type names and code id may stay).
import { readFileSync } from 'node:fs'
const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8')
for (const f of ['components/page-editor/blocks/midnight.tsx', 'components/page-editor/blocks/midnight-practice.tsx']) {
  const src = read(f)
  if (/block\('Midnight/.test(src)) { console.error(`LIVE-2369: ${f} labels a block Midnight`); process.exit(1) }
  if (!/block\('Nocturne /.test(src)) { console.error(`LIVE-2369: ${f} has no Nocturne block labels`); process.exit(1) }
}
console.log('LIVE-2369: the Nocturne editor blocks say Nocturne')
