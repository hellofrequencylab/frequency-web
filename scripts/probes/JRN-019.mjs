#!/usr/bin/env node
// JRN-019: Attended and Certified course credentials. Checks the consequences in source:
//   1. Credentials and Community Books are stored service role only (migration 20270346092000, rls-deny-all).
//   2. Attended is issued by the follow-up cron when a Run's last session ends, with one email per credential.
//   3. A learner can send in a Community Book from /courses/<slug>/certify, and a reviewer decides it from the
//      Community Books queue on the admin Journeys page.
//   4. Every credential is public by id at /credentials/<id>, with a badge.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const has = (p) => existsSync(new URL(p, root))
const fails = []

if (!has('supabase/migrations/20270346092000_course_credentials.sql')) fails.push('the credentials migration is missing')
const denyAll = read('scripts/rls-deny-all.txt')
if (!/^course_credentials$/m.test(denyAll) || !/^community_book_submissions$/m.test(denyAll)) fails.push('credential tables are not service role only')

const followups = read('app/api/cron/event-followups/route.ts')
if (!followups.includes('issueAttended(') || !followups.includes('sendCredentialEmail(')) fails.push('the follow-up cron does not issue Attended')
if (!followups.includes('dedupeKey: `credential:')) fails.push('the Attended email is not deduped per credential')

if (!has('app/(marketing)/courses/[slug]/certify/page.tsx')) fails.push('there is no Community Book page')
if (!read('app/(marketing)/courses/actions.ts').includes('submitCommunityBookAction')) fails.push('a Community Book cannot be sent in')
if (!read('lib/widgets/modules.ts').includes("'admin-journeys-credentials'")) fails.push('no Community Book review queue')

if (!has('app/(marketing)/credentials/[id]/page.tsx')) fails.push('credentials have no public page')
if (!has('app/(marketing)/credentials/[id]/badge.svg/route.ts')) fails.push('credentials have no badge')
if (/\.replace\(\/<\[\^>\]\+>\/g/.test(read('lib/email.ts'))) fails.push('an email strips tags to build its text (CodeQL)')

if (fails.length) {
  console.log('JRN-019 FAIL')
  for (const f of fails) console.log(` - ${f}`)
  process.exit(1)
}
console.log('JRN-019 ok: Attended and Certified credentials are stored, issued, reviewed and public by id')
