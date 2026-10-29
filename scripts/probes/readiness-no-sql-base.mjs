#!/usr/bin/env node
// HYG-218: a PR with no SQL needs only a matching head; only a PR that adds SQL needs a current base.
//
// Reads the runner, publisher and consumer for the split and fails if either path loses its guard.
import { readFileSync } from 'node:fs'

const bad = []
const read = (file) => readFileSync(file, 'utf8')
const runner = read('scripts/migration-pr-readiness.mjs')
const publisher = read('scripts/publish-migration-readiness.mjs')
const verifier = read('scripts/verify-migration-readiness.mjs')
const need = (source, re, why) => { if (!re.test(source)) bad.push(why) }

need(runner, /baseSha = pr\?\.base\?\.sha/, 'runner no longer takes the PR\'s own base')
need(runner, /requireFact\(baseSha === mainSha/, 'runner no longer requires a current base for a SQL PR')
need(publisher, /needsCurrentMain/, 'publisher no longer separates SQL results from no-SQL results')
need(publisher, /current\(result\.status !== 'not_applicable'\)/, 'publisher stopped rechecking main for SQL results')
need(verifier, /requireCurrentBase/, 'consumer lost its current-base guard')
need(verifier, /noSql/, 'consumer no longer recognises a no-SQL receipt')
need(verifier, /if \(!noSql\) requireCurrentBase\(\)/, 'consumer accepts a SQL receipt on a stale base')
need(verifier, /parents\[1\] === head/, 'consumer lost the exact-head merge-tree check')

if (bad.length) {
  console.error(`No-SQL readiness split is broken:\n- ${bad.join('\n- ')}`)
  process.exit(1)
}
console.log('No-SQL PRs need only a matching head; SQL PRs still need a current base.')
