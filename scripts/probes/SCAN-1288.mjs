#!/usr/bin/env node
// SCAN-1288: member and host server actions never hand a raw database or storage error message back
// to the screen. PostgREST text names tables, columns, constraints and RLS policies.
import { readFileSync } from 'node:fs'

const FILES = [
  'app/(main)/library/actions.ts',
  'app/(main)/events/[slug]/social-actions.ts',
  'app/(main)/events/admin-actions.ts',
  'app/(main)/settings/profile/spotlight-actions.ts',
  'app/(main)/settings/notifications/actions.ts',
  'app/(main)/partners/listing/actions.ts',
  'app/(main)/partners/join/actions.ts',
  'app/(main)/upgrade/actions.ts',
  'app/(main)/messages/rooms/actions.ts',
  'app/(main)/practices/admin-actions.ts',
  'app/(main)/pages/home/actions.ts',
  'app/(main)/people/friend-actions.ts',
  'app/(main)/people/[handle]/actions.ts',
  'components/push/actions.ts',
  'lib/menus/actions.ts',
  'lib/page-content-actions.ts',
  'lib/connections/connection-settings-actions.ts',
]
const RAW = /(?:fail\(|return \{ (?:ok: false, )?error: )\w+\??\.message/
const hits = []
for (const f of FILES) {
  readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (RAW.test(line)) hits.push(`${f}:${i + 1}`)
    })
}
const helper = readFileSync(new URL('../../lib/action-result.ts', import.meta.url), 'utf8')
if (hits.length || !/export function safeErrorMessage\(/.test(helper)) {
  console.error(`SCAN-1288 FAIL: ${hits.length} member-facing action(s) return a raw database message:\n  ${hits.slice(0, 10).join('\n  ')}`)
  process.exit(1)
}
console.log(`SCAN-1288 ok: ${FILES.length} action files hide raw database messages`)
