import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import ts from 'typescript'

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
const history = workflow.split('- name: Fetch base history for check:shipped-ids')[1]?.split('\n      - name:')[0]
assert.ok(history?.includes('origin "$GITHUB_SHA"'), 'Manual CI must deepen the actual checkout, not only main')
assert.ok(history.includes('${GITHUB_BASE_REF:-main}'), 'Retain base history for PR/main comparison')
const lifecycle = readFileSync('scripts/probes/lifecycle-copy.mjs', 'utf8')
assert.ok(lifecycle.indexOf('const compiled=') < lifecycle.indexOf('function load(file)'), 'Compile reviewed source before VM execution')
assert.match(lifecycle, /vm\.runInNewContext\(code,/)
assert.match(lifecycle, /timeout:1000/)

// Exercise the actual subprocess collector with a bounded synthetic failure, not a nested suite.
const file = 'scripts/check-backlog.mjs'
const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
const names = ['probeEnv', 'parseProbeReport', 'spawnProbe']
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
assert.equal(functions.length, names.length)
const collector = new Function('spawn', 'PROBE_CPU_PRELOAD', functions.map(node => node.getText(source)).join('\n') + '\nreturn spawnProbe')(spawn, resolve('scripts/backlog-probe-cpu.cjs'))
const result = await collector(`node -e 'process.stderr.write("collector-fixture\\n" + "x".repeat(20000)); process.exit(1)'`)
assert.equal(result.status, 1)
assert.match(result.stderr, /^collector-fixture/)
assert.ok(Buffer.byteLength(result.stderr) <= 8192)
assert.equal(typeof result.cpuMs, 'number', 'CPU report must remain separate from failure output')
console.log('Checkout/base history and unchanged VM deadline are wired; actual collector retains bounded stderr and separate CPU attribution.')
