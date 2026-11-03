#!/usr/bin/env node
// LIVE-1968: a Create a Space draft saved to an email gets three reminders, one hour, one day and three days after the
// last save, at most three, only 8am to 8pm in the browser's zone, ending when they save again, launch or unsubscribe.
//
// Runs lib/create-space/draft-recovery.ts under node (the schedule, the hours, the ended states, the handle rule) and
// reads the cron, the runner, the emails, the unsubscribe branch and the registrations (the switch, the claim, the
// heartbeat, the schedule, the monitor declaration, the runbook gate).
import { readFileSync } from 'node:fs'
import { DRAFT_REMINDER_KINDS, draftReminderDue } from '../../lib/create-space/draft-recovery.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const route = read('app/api/cron/create-space-draft-reminders/route.ts')
const io = read('lib/create-space/draft-recovery-io.ts')
const email = read('lib/create-space/draft-recovery-email.ts')
const api = read('app/api/unsubscribe/route.ts')
const page = read('app/unsubscribe/page.tsx')
const vercel = read('vercel.json')
const slos = read('lib/observability/slos.ts')
const env = read('.env.example')
const runbook = read('docs/RUNBOOKS.md')
const migration = read('supabase/migrations/20270346028700_create_space_draft_email_log.sql')

// The pure schedule.
const STOP = '2026-10-27T18:00:00Z' // 11:00 PDT
const LA = 'America/Los_Angeles'
const draft = (over = {}) => ({ savedAt: STOP, convertedAt: null, unsubscribedAt: null, handleTaken: false, ...over })
const after = (h) => new Date(Date.parse(STOP) + h * 3_600_000)
const kind = (d) => d.kind
if (DRAFT_REMINDER_KINDS.join() !== 'draft_1h,draft_1d,draft_3d') bad.push('the three kinds are not one hour, one day, three days')
if (kind(draftReminderDue(after(0.9), draft(), [], LA)) !== null) bad.push('an email is owed before an hour')
if (kind(draftReminderDue(after(1), draft(), [], LA)) !== 'draft_1h') bad.push('the one-hour email is not owed at an hour')
if (kind(draftReminderDue(after(24), draft(), [{ kind: 'draft_1h', sentAt: '2026-10-27T19:05:00Z' }], LA)) !== 'draft_1d') bad.push('the one-day email is not owed at a day')
const all3 = DRAFT_REMINDER_KINDS.map((k, i) => ({ kind: k, sentAt: new Date(Date.parse(STOP) + (i + 1) * 3_600_000 * 20).toISOString() }))
if (kind(draftReminderDue(after(200), draft(), all3, LA)) !== null) bad.push('a fourth email is owed')
const night = draft({ savedAt: '2026-10-28T04:30:00Z' })
if (kind(draftReminderDue(new Date('2026-10-28T05:30:00Z'), night, [], LA)) !== null) bad.push('an email is owed at 10:30pm local')
if (kind(draftReminderDue(new Date('2026-10-28T15:00:00Z'), night, [], LA)) !== 'draft_1h') bad.push('the held email is not owed at 8am local')
const evening = draft({ savedAt: '2026-10-28T00:00:00Z' })
if (kind(draftReminderDue(new Date('2026-10-28T02:59:00Z'), evening, [], LA)) !== 'draft_1h') bad.push('7:59pm local is closed')
if (kind(draftReminderDue(new Date('2026-10-28T03:00:00Z'), evening, [], LA)) !== null) bad.push('8:00pm local is open')
if (kind(draftReminderDue(after(1), draft(), [], null)) !== null) bad.push('an email is owed with no known time zone')
if (kind(draftReminderDue(after(5), draft({ convertedAt: '2026-10-27T18:30:00Z' }), [], LA)) !== null) bad.push('a launched draft is emailed')
if (kind(draftReminderDue(after(5), draft({ unsubscribedAt: '2026-10-27T18:30:00Z' }), [], LA)) !== null) bad.push('an unsubscribed draft is emailed')
if (kind(draftReminderDue(new Date('2026-10-29T20:00:00Z'), draft({ savedAt: '2026-10-27T20:00:00Z' }), [{ kind: 'draft_1h', sentAt: '2026-10-27T19:05:00Z' }], LA)) !== null) bad.push('emails continue after they save again')
const two = [{ kind: 'draft_1h', sentAt: '2026-10-27T19:05:00Z' }, { kind: 'draft_1d', sentAt: '2026-10-28T19:05:00Z' }]
if (kind(draftReminderDue(after(73), draft(), two, LA)) !== 'draft_3d') bad.push('the three-day email is not owed at three days')
if (kind(draftReminderDue(after(73), draft({ handleTaken: true }), two, LA)) !== null) bad.push('the three-day email goes out for a handle someone else now has')

// The wiring.
if (!/draftRemindersEnabled\(\)/.test(route)) bad.push('the cron runs while CREATE_SPACE_DRAFT_REMINDERS_ENABLED is off')
if (!/withCronHeartbeat\('create-space-draft-reminders'/.test(route) || !/rejectUnauthorizedCron/.test(route)) bad.push('the cron has no heartbeat or no auth')
if (!/cronBudget\(/.test(route)) bad.push('the cron has no budget')
if (!/isSuppressed\(/.test(io)) bad.push('the runner skips the suppression list')
if (!/create_space_draft_email_log/.test(io) || !/23505/.test(io)) bad.push('the runner does not claim a kind in create_space_draft_email_log')
if (!/unique\s*\(\s*draft_id\s*,\s*trigger_kind\s*\)/i.test(migration)) bad.push('the log is not unique per draft and kind')
if (!/isSpaceSlugTaken/.test(io)) bad.push('the day-3 handle is not re-checked')
if (!/purge_after/.test(io)) bad.push('the runner does not purge old drafts')
if (!/enqueueEmail/.test(io) || /sendRawEmail|new Resend/.test(io + email)) bad.push('the emails do not go through the outbox send seam')
if (!/listUnsubscribeHeaders/.test(io) || !/unsubscribe\?d=/.test(io)) bad.push('the emails carry no draft unsubscribe')
if (!/processDraftUnsubscribe/.test(api) || !/searchParams\.get\('d'\)/.test(api)) bad.push('one-click unsubscribe does not take the draft link')
if (!/ConfirmDraftUnsubscribe/.test(page)) bad.push('the unsubscribe page has no draft confirm')
if (/[—–]/.test(email)) bad.push('the email copy has a dash')
if (!/private draft/.test(email)) bad.push('the emails do not say it is a private draft')
if (/held for you|reserved/i.test(email)) bad.push('the day-3 email claims the handle is held')
if (!/create-a-space\?kit=/.test(io)) bad.push('the button does not go back to /create-a-space')
if (!/"path": "\/api\/cron\/create-space-draft-reminders"/.test(vercel)) bad.push('the cron is not scheduled')
if (!/'create-space-draft-reminders'/.test(slos)) bad.push('the cron is not declared in the monitoring contract')
if (/process\.env\.CREATE_SPACE_[A-Z_]* === /.test(route + io)) bad.push('a switch is read by hand')
if (!/^CREATE_SPACE_DRAFT_REMINDERS_ENABLED=/m.test(env)) bad.push('the switch is not listed in .env.example')
if (!/Create a Space draft reminders/.test(runbook)) bad.push('the RUNBOOKS gate does not name the draft reminders')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ draft reminders: 1h, 1d, 3d after the last save, max three, 8am to 8pm local, end on save, launch or unsubscribe, day 3 skipped for a taken handle')
