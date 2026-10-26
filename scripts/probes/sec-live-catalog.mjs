import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// The weekly sweep reads the live pg_catalog through scripts/maintenance/live-catalog.mjs.
const wf = readFileSync('.github/workflows/maintenance.yml', 'utf8')
assert.match(wf, /id: livecatalog/)
assert.match(wf, /scripts\/maintenance\/live-catalog\.mjs --print-query/)
assert.match(wf, /steps\.livecatalog\.outputs\.code == '1'/, 'a finding must reach the tracking issue')
assert.match(wf, /read\('livecatalog\.txt'\)/)
console.log('The maintenance sweep checks the live catalog and reports findings.')
