#!/usr/bin/env node
// LIVE-2368 probe: the three blocks that sat in no palette group are grouped, the orphan pin is empty, and no palette
// group title says Midnight.
import { readFileSync } from 'node:fs'
const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8')
const fail = (m) => { console.error(`LIVE-2368: ${m}`); process.exit(1) }
const config = read('lib/page-editor/config.tsx')
if (!/components: \['Heading', 'DisplayHeading', 'Text', 'Prose',/.test(config)) fail('DisplayHeading and Prose are not in Content')
if (!/'SpaceLayout',\s*'SpaceArrangement',/.test(config)) fail('SpaceArrangement is not in Profile')
if (/title: '[^']*Midnight/.test(config)) fail('a palette group title says Midnight')
if (!/expect\(orphans\.sort\(\)\)\.toEqual\(\[\]\)/.test(read('lib/page-editor/palette-scope.test.ts'))) fail('the orphan pin is not empty')
console.log('LIVE-2368: every website block sits in a palette group, and the Nocturne groups say Nocturne')
