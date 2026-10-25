import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// Keep this intentional compatibility pin until the Expo/xcode consumer is reviewed again.
const pkg = JSON.parse(readFileSync('mobile/package.json', 'utf8'))
assert.equal(pkg.pnpm?.overrides?.['xcode@3.0.1>uuid'], '11.1.1')
const lock = readFileSync('mobile/pnpm-lock.yaml', 'utf8')
assert.match(lock, /^  xcode@3\.0\.1>uuid: 11\.1\.1$/m)
assert.match(lock, /^  xcode@3\.0\.1:\n    dependencies:\n      simple-plist: [^\n]+\n      uuid: 11\.1\.1$/m)
const versions = [...new Set([...lock.matchAll(/^  uuid@(\d+\.\d+\.\d+):/gm)].map(match => match[1]))]
assert.deepEqual(versions, ['11.1.1'], 'Every locked UUID instance must resolve to the reviewed CommonJS-compatible patch')
assert.ok(pkg.scripts.test.split(' && ').includes('node --test scripts/xcode-uuid.test.cjs'), 'Mobile CI must execute the actual Expo consumer regression')
console.log('Mobile xcode UUID override and lock use11.1.1; actual consumer tests remain wired into mobile check.')
