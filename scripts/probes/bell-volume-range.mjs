import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync('components/on-air/session.tsx', 'utf8')
const input = [...source.matchAll(/<input\b[\s\S]*?\/>/g)].map(m => m[0]).find(s => s.includes('aria-label="Bell volume"'))
assert.ok(input, 'Bell volume range must remain accessible')
const number = name => Number(input.match(new RegExp(`\\b${name}=\\{(\\d+)\\}`))?.[1])
assert.equal(number('min'), 0)
assert.equal(number('max'), 100)
assert.equal(number('step'), 1, 'Saved whole-percent bell values must be representable without browser step mismatch')
assert.match(input, /value=\{Math\.round\(bellVolume \* 100\)\}/)
console.log('Bell volume range represents the displayed whole-percent saved preference')
