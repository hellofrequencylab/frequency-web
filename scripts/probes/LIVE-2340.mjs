#!/usr/bin/env node
// LIVE-2340: staff can welcome each new member by hand from the Resonance CRM roster. A new member with no welcome on
// record carries a glowing "Say hi" pill; it opens the member composer on a pre-filled welcome pinned to that member;
// the send rides the ordinary gated 1:1 send and records the welcome (member_welcomes) so the glow clears. On main
// none of this existed: the roster had no welcome signal and nothing recorded a personal welcome.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => (existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), 'utf8') : '')
const fails = []

const migration = read('supabase/migrations/20270346090000_member_welcomes.sql')
if (!/create table if not exists public\.member_welcomes/.test(migration)) fails.push('no member_welcomes table migration')
if (!/enable row level security/.test(migration)) fails.push('member_welcomes has no row level security')

const summaries = read('app/(main)/admin/crm/member-summaries.ts')
if (!/welcomePending: welcomePending\.has\(r\.profileId\)/.test(summaries)) fails.push('the CRM roster does not flag members who need a welcome')
if (!/summariesFromRows\(rows, \{ welcome: !opts\.spaceId \}\)/.test(summaries)) fails.push('the welcome glow is not limited to the platform roster')

const viewer = read('components/people/member-viewer/member-viewer.tsx')
if (!/<WelcomeGlowMark/.test(viewer) || !/<WelcomeDialog/.test(viewer) || !/<WelcomeBanner/.test(viewer)) fails.push('the roster rows do not render the welcome glow and pop-up')

const actions = read('components/admin/crm/welcome-actions.ts')
const send = actions.slice(actions.indexOf('export async function sendWelcomeAction('))
if (!/sendMemberMessageAction\(campaignId, \[`profile:\$\{profileId\}`\]\)/.test(send)) fails.push('the welcome send is not pinned to the one member through the gated 1:1 send')
if (!/recordWelcome\(/.test(send)) fails.push('a sent welcome is not recorded')
if (!/approverGate\(\)/.test(send)) fails.push('the welcome send is not approver-gated')

const composer = read('components/admin/crm/member-composer.tsx')
if (!/startDraft \? await startDraft\(\)/.test(composer)) fails.push('the composer cannot open on a pre-filled draft')

if (fails.length) {
  console.error(`LIVE-2340 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2340 ok: the personal welcome glow, pop-up, gated send and record are wired')
