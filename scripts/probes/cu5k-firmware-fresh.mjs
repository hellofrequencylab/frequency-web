#!/usr/bin/env node
// LIVE-1267 probe: the Update tab sees a new firmware release as soon as it is published. The release
// list was fetch-cached for 5 minutes, so the owner was offered 0.1.4 ten minutes after 0.1.5 shipped
// (2026-10-21). Fails while the list fetch is cached again.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const f = r('lib/devices/firmware.ts')
const list = f.match(/async function listReleases\(\)[\s\S]*?\n}\n/)?.[0] ?? ''
if (!/cache: 'no-store'/.test(list) || /revalidate/.test(list)) {
  console.error('LIVE-1267 probe failed:\n- the firmware release list is cached, so a new release can stay hidden from the Update tab')
  process.exit(1)
}
console.log('LIVE-1267: the Update tab reads the release list fresh')
