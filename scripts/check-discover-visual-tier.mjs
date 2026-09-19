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
const advisory = pkg.scripts['test:e2e:visual:shell'] ?? ''

if (!stable.includes('@shell|@advisory')) {
  fail(`the blocking visual grep still lets /discover in: ${stable}`)
}
if (!advisory.includes('@advisory')) {
  fail(`the advisory visual grep does not take @advisory: ${advisory}`)
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
