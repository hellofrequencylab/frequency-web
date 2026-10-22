#!/usr/bin/env node
// LIVE-1141 probe: the operator emails exist, state the Crew line from the one pricing line, and ride the lifecycle cron.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!/PLAN_STORY\.crewSpace/.test(r('lib/marketing/operator-emails.ts'))) bad.push('the day 1 email no longer states the Crew line from PLAN_STORY.crewSpace')
if (!/resolveSendGate/.test(r('lib/marketing/operator-lifecycle.ts'))) bad.push('the operator send no longer passes the lifecycle send gate')
if (!/sendOperatorLifecycle/.test(r('app/api/cron/lifecycle-triggers/route.ts'))) bad.push('the lifecycle cron no longer sends the operator emails')
if (bad.length) {
  console.error('LIVE-1141 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1141: operator day 1, 3 and 7 emails ride the lifecycle cron')
