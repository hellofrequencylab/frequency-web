import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const name = '20261027033306_atomic_manual_room_writes.sql'
const transaction = file => { const source = fs.readFileSync(file, 'utf8'); const offset = source.indexOf('BEGIN;'); assert.ok(offset >= 0); return source.slice(offset) }
const proposal = transaction('docs/database/room-atomic-proposal.sql')
assert.equal(transaction('supabase/migrations/' + name), proposal, 'Registered transaction must match approved proposal byte for byte')
assert.equal(createHash('sha256').update(proposal).digest('hex'), '411eaeec0f1c431df255dc62506697c13c478bd46bab54ce90ff1ccab158f078')
const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
assert.ok(files.length >= 861, 'Reviewed migration inventory cannot shrink silently')
assert.equal(files.filter(f => f === name).length, 1)
console.log(JSON.stringify({ status: 'PASS', migration: name, files: files.length, orderedPosition: files.indexOf(name) + 1, transactionSha256: createHash('sha256').update(proposal).digest('hex'), production: 'Not applied or authorized; remote ledger preflight and separate rollout approval required' }))
