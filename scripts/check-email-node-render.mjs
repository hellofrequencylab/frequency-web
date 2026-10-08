// LIVE-877 baseline: frozen legacy HTML/text before native renderer conversion.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {renderEmailLayout} from '../lib/email-studio/render.ts'
const bytes=readFileSync('scripts/fixtures/email-node-render/legacy-golden.json')
const golden=JSON.parse(bytes)
const hash=value=>createHash('sha256').update(value).digest('hex')
assert.equal(hash(readFileSync('scripts/entity-layout-corpus.json')),golden.sourceSha256)
assert.equal(golden.documents.length,19)
for(const document of golden.documents)assert.deepEqual(renderEmailLayout(document.layout),document.output,document.id)
console.log('ok: all19 deterministic authored historical email outputs match pre-conversion golden strings')
