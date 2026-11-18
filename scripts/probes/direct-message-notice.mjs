#!/usr/bin/env node
// EMAIL-055: every path that writes a 1:1 message tells the recipient. Fails when a writer stops calling the notice, the
// registry loses the message.direct row, or the notice stops limiting itself to one per unread burst.
import { readFileSync } from 'node:fs'
const writers = [
  'app/(main)/messages/actions.ts',
  'lib/marketplace/listing-offers.ts',
  'app/(main)/(marketplace)/market/service-actions.ts',
  'app/(main)/events/[slug]/social-actions.ts',
]
const bad = []
for (const w of writers) if (!readFileSync(w, 'utf8').includes('notifyDirectMessage(')) bad.push(`${w} writes a message without telling the recipient`)
const registry = readFileSync('lib/notifications/registry.ts', 'utf8')
if (!registry.includes("'message.direct': {")) bad.push('the registry has no message.direct row')
let notify = ''
try { notify = readFileSync('lib/messages/dm-notify.ts', 'utf8') } catch { bad.push('lib/messages/dm-notify.ts is missing') }
if (notify && !notify.includes('startsUnreadBurst(')) bad.push('the notice is not limited to one per unread burst')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('ok: a direct message tells the recipient')
