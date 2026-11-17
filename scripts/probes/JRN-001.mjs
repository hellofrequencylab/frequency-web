#!/usr/bin/env node
// JRN-001: saving the Advanced "Discovery layout" keeps a Journey's outcomes, guarantee, FAQ and guide
// progress (Journey audit 2026-11-17). The save must merge onto the stored page_config, not replace it.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const actions = read('app/(main)/journeys/actions.ts')
const at = actions.indexOf('export async function setJourneyPageConfig(')
const body = at < 0 ? '' : actions.slice(at, actions.indexOf('\nexport ', at + 10))
if (!body) fails.push('setJourneyPageConfig is gone')
if (!/mergePageLayout\(\s*stored/.test(body)) fails.push('setJourneyPageConfig writes the layout array as-is (no merge onto the stored page_config)')
const merge = read('lib/journeys/page-layout-merge.ts')
if (!/settings\s*=\s*prev\.settings/.test(merge)) fails.push('mergePageLayout does not carry each entry\'s stored settings')
if (!/if \(!named\.has\(e\.id\)\) out\.push\(e\)/.test(merge)) fails.push('mergePageLayout drops stored entries the save did not name (the wizard row)')

if (fails.length) {
  console.error(`JRN-001 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-001 ok: a layout save merges onto the stored page_config')
