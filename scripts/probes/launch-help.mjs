#!/usr/bin/env node
// LIVE-1927: the launcher has a member help article and a runbook entry.
import { existsSync, readFileSync } from 'node:fs'
const bad = []
if (!existsSync('content/help/spaces/finish-setting-up-your-space.md')) bad.push('the Finish setup help article is gone')
if (!readFileSync('docs/RUNBOOKS.md', 'utf8').includes('The lightbox and the Setup list')) bad.push('the RUNBOOKS entry for the lightbox and Setup list is gone')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('launch help: ok')
