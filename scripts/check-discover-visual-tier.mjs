#!/usr/bin/env node
// LIVE-373: /discover visual captures must not block every open PR when a Circle lists.
import { readFileSync } from 'node:fs'

const fail = (m) => {
  console.error(m)
  process.exit(1)
}

const vis = readFileSync('test/e2e/visual.spec.ts', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const stable = pkg.scripts['test:e2e:visual:stable'] ?? ''
const shell = pkg.scripts['test:e2e:visual:shell'] ?? ''
const advisory = pkg.scripts['test:e2e:visual:advisory'] ?? ''

if (!stable.includes('@shell|@advisory')) {
  fail(`the blocking public visual grep still lets /discover in: ${stable}`)
}
if (!advisory.includes('@advisory')) {
  fail(`the advisory visual grep does not take @advisory: ${advisory}`)
}
// LIVE-313 moved the shell step onto a blocking gate. Folding @advisory back into that
// grep would make /discover block again, which is the LIVE-373 defect.
if (/\(\?=.*@advisory\)/.test(shell) || /@shell\|@advisory|@advisory\|@shell/.test(shell)) {
  fail(`the blocking shell grep also takes @advisory, so /discover would fail every PR: ${shell}`)
}
if (!vis.includes('visual · discover')) {
  fail('visual.spec.ts has no discover describe')
}
const start = vis.indexOf("test.describe('visual · discover'")
if (start < 0) fail('visual.spec.ts has no discover describe')
const block = vis.slice(start, start + 280)
if (!block.includes('@advisory')) fail('discover visual is not tagged @advisory')
if (block.includes('@shell')) {
  fail('discover visual carries @shell, which lies to the app-shell reporter')
}
if (!vis.includes("s.path !== '/discover'")) {
  fail('the blocking public loop still photographs /discover')
}

process.exit(0)
