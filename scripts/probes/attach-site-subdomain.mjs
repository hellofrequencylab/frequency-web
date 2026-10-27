#!/usr/bin/env node
// LIVE-1496: a site published by SQL or a seed can have its free subdomain attached by one script.
//
// Fails when the attach script is gone, stops refusing a bad slug or missing Vercel config, stops posting to the
// project domains endpoint, or the seed scripts stop naming it as the last step.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const bad = []
const src = readFileSync('scripts/attach-site-subdomain.mjs', 'utf8')
if (!src.includes('/domains?teamId=') || !/BASE_DOMAIN\s*=\s*'frequencylocal\.com'/.test(src)) bad.push('the script no longer posts <slug>.frequencylocal.com to the project domains')
const run = (args) => spawnSync('node', ['scripts/attach-site-subdomain.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } })
if (run(['Bad_Slug']).status !== 1) bad.push('a malformed slug is no longer refused')
const noCfg = run(['alliraebuilddesign'])
if (noCfg.status !== 1 || !noCfg.stderr.includes('VERCEL_API_TOKEN')) bad.push('missing Vercel config no longer fails with a clear message')
for (const f of ['scripts/seed-alli-rae-rename.mts', 'scripts/seed-alli-rae.mts'])
  if (!readFileSync(f, 'utf8').includes('attach-site-subdomain')) bad.push(`${f} does not name the attach step`)
if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('A seeded site gets its subdomain through scripts/attach-site-subdomain.mjs, and the seeds say so.')
