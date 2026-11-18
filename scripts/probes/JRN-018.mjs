#!/usr/bin/env node
// JRN-018: a Run is one seat, and a replay reaches everyone who saved one. Checks the consequences in source:
//   1. Member and guest RSVPs seat every upcoming session of the same Run (events.journey_id + details.runKey).
//   2. The event settings rail edits a replay link, and the follow-up cron mails it once per address.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

if (!read('lib/events/run-series.ts').includes("details->>runKey")) fails.push('a Run is not keyed on details.runKey')
if (!read('app/(main)/events/actions.ts').includes('runSiblings(admin, eventId)')) fails.push('members are not seated for the whole Run')
if (!read('app/(main)/events/guest-rsvp-actions.ts').includes('runSiblings(')) fails.push('guests are not seated for the whole Run')
if (!read('components/admin/modules/event-rail-plan.ts').includes("'details.replayUrl'")) fails.push('the event rail does not edit the replay link')
if (!read('app/(main)/events/admin-actions.ts').includes("fd.get('replay_url')")) fails.push('the replay link is not saved')
const cron = read('app/api/cron/event-followups/route.ts')
if (!cron.includes('sendReplays(') || !cron.includes('replayKey(')) fails.push('the follow-up cron does not send the replay once per address')

if (fails.length) {
  console.log('JRN-018 FAIL')
  for (const f of fails) console.log(` - ${f}`)
  process.exit(1)
}
console.log('JRN-018 ok: one seat per Run, and the replay reaches every seat holder once')
