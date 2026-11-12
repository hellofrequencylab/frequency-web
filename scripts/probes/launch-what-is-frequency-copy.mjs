// LIVE-2268: the /what-is-frequency template no longer says the retired "Host free with Crew".
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const tpl = readFileSync('lib/page-editor/templates/what-is-frequency.ts', 'utf8')
assert.doesNotMatch(tpl, /host free with crew/i, 'what-is-frequency still says Host free with Crew')
console.log('The /what-is-frequency template does not say Host free with Crew.')
