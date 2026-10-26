import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// Review this intentional release pin against upstream advisories before changing it.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(pkg.pnpm?.overrides?.['vite@>=8.0.0 <8.1.6'], '8.1.6')
const lock = readFileSync('pnpm-lock.yaml', 'utf8')
const versions = [...new Set([...lock.matchAll(/^  vite@(\d+\.\d+\.\d+)(?:\(|:)/gm)].map(match => match[1]))]
assert.ok(versions.length, 'Do not pass a missing or unparsed Vite lock entry')
assert.deepEqual(versions, ['8.1.6'], 'Every locked Vite instance must use the reviewed patched release')
console.log('Vite release pin and all locked instances are8.1.6; runtime boundary regression is checked separately.')
