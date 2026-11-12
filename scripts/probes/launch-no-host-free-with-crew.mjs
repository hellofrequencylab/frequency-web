// LIVE-2267: the retired claim "Host free with Crew" is gone from the public surfaces that still carried it.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const files = [
  'app/(marketing)/pricing/page.tsx',
  'app/llms-full.txt/route.ts',
  'lib/page-editor/templates/home.ts',
]
for (const f of files) {
  assert.doesNotMatch(readFileSync(f, 'utf8'), /host free with crew/i, `${f} still says Host free with Crew`)
}
console.log('No public surface says Host free with Crew.')
