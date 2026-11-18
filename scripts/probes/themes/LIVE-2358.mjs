#!/usr/bin/env node
// LIVE-2358 probe: Free Human and Mindless are offered in the pickers and every offered theme has a catalog entry.
// Reads the sources (no build): RETIRED_FROM_PICKERS in lib/theme/site-style.ts and the ids in lib/themes/library.ts.
import { readFileSync } from 'node:fs'
const style = readFileSync('lib/theme/site-style.ts', 'utf8')
const lib = readFileSync('lib/themes/library.ts', 'utf8')
const retired = style.match(/RETIRED_FROM_PICKERS[^=]*=\s*new Set\(\[([^\]]*)\]/)?.[1] ?? ''
const problems = []
for (const id of ['free-human', 'mindless']) if (retired.includes(`'${id}'`)) problems.push(`${id} is still retired from the pickers`)
for (const id of ['free-human', 'mindless', 'new-world', 'services', 'cyberwitch']) if (!lib.includes(`id: '${id}'`)) problems.push(`${id} has no theme library entry`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
console.log('LIVE-2358: Free Human and Mindless offered; every offered theme catalogued')
