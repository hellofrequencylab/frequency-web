import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(pkg.pnpm?.overrides?.['fast-uri@>=3.0.0 <3.1.9'], '3.1.9')
const lock = readFileSync('pnpm-lock.yaml', 'utf8')
const versions = [...new Set([...lock.matchAll(/^  fast-uri@(\d+\.\d+\.\d+)(?:\(|:)/gm)].map(m => m[1]))]
assert.ok(versions.length, 'Do not pass an absent or unparsed parser instance')
assert.deepEqual(versions, ['3.1.9'], 'Every locked fast-uri instance must use the reviewed patched release')
assert.match(lock, /ajv@8\.20\.0:[\s\S]*?fast-uri: 3\.1\.9/, 'The actual Ajv consumer must resolve the patch')
console.log('Reviewed fast-uri3.1.9 pin, all lock instances and Ajv dependency binding agree; actual parser/consumer consequences are tested separately.')
