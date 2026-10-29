#!/usr/bin/env node
// VLS-26 / VLS-27: the come-back emails go out one hour, one day and three days after a person stops, at most three,
// only 8am to 8pm in their own zone, and end when they resume, launch, cancel or opt out.
//
// Runs lib/launch/comeback.ts under node (the schedule, the hours, the stopped states) and reads the cron, the runner,
// the switch and the registrations (the send gate, the claim, the heartbeat, the schedule, the monitor declaration).
import { readFileSync } from 'node:fs'
import { comebackDue, COMEBACK_KINDS } from '../../lib/launch/comeback.ts'
import { toSnapshot } from '../../lib/launch/state.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const route = read('app/api/cron/launch-reminders/route.ts')
const io = read('lib/launch/comeback-io.ts')
const email = read('lib/launch/comeback-email.ts')
const vercel = read('vercel.json')
const slos = read('lib/observability/slos.ts')
const env = read('.env.example')
const runbook = read('docs/RUNBOOKS.md')

// The pure schedule.
const STOP = '2026-10-27T18:00:00Z' // 11:00 PDT
const LA = 'America/Los_Angeles'
const launch = (over = {}) => toSnapshot({ id: 'l1', owner_id: 'p1', niche: 'coaches', started_at: '2026-10-27T17:00:00Z', updated_at: STOP, steps: { spotlight: { status: 'published' } }, ...over })
const after = (h) => new Date(Date.parse(STOP) + h * 3_600_000)
const kind = (d) => d.kind
if (COMEBACK_KINDS.join() !== 'comeback_1h,comeback_1d,comeback_3d') bad.push('the three kinds are not one hour, one day, three days')
if (kind(comebackDue(after(0.9), launch(), [], LA)) !== null) bad.push('an email is owed before an hour')
if (kind(comebackDue(after(1), launch(), [], LA)) !== 'comeback_1h') bad.push('the one-hour email is not owed at an hour')
if (kind(comebackDue(after(24), launch(), [{ kind: 'comeback_1h', sentAt: '2026-10-27T19:05:00Z' }], LA)) !== 'comeback_1d') bad.push('the one-day email is not owed at a day')
const all3 = COMEBACK_KINDS.map((k, i) => ({ kind: k, sentAt: new Date(Date.parse(STOP) + (i + 1) * 3_600_000 * 20).toISOString() }))
if (kind(comebackDue(after(200), launch(), all3, LA)) !== null) bad.push('a fourth email is owed')
const night = launch({ updated_at: '2026-10-28T04:30:00Z' })
if (kind(comebackDue(new Date('2026-10-28T05:30:00Z'), night, [], LA)) !== null) bad.push('an email is owed at 10:30pm local')
if (kind(comebackDue(new Date('2026-10-28T15:00:00Z'), night, [], LA)) !== 'comeback_1h') bad.push('the held email is not owed at 8am local')
const evening = launch({ updated_at: '2026-10-28T00:00:00Z' })
if (kind(comebackDue(new Date('2026-10-28T02:59:00Z'), evening, [], LA)) !== 'comeback_1h') bad.push('7:59pm local is closed')
if (kind(comebackDue(new Date('2026-10-28T03:00:00Z'), evening, [], LA)) !== null) bad.push('8:00pm local is open')
if (kind(comebackDue(after(1), launch(), [], null)) !== null) bad.push('an email is owed with no known time zone')
if (kind(comebackDue(after(5), launch({ completed_at: '2026-10-27T18:30:00Z' }), [], LA)) !== null) bad.push('a launched launch is emailed')
if (kind(comebackDue(after(5), launch({ cancel_requested_at: STOP, cancelled_at: STOP }), [], LA)) !== null) bad.push('a cancelled launch is emailed')
if (kind(comebackDue(new Date('2026-10-29T20:00:00Z'), launch({ updated_at: '2026-10-27T20:00:00Z' }), [{ kind: 'comeback_1h', sentAt: '2026-10-27T19:05:00Z' }], LA)) !== null) bad.push('emails continue after they resume')

// The wiring.
if (!/launchSystemEnabled\(\)/.test(route)) bad.push('the cron runs while LAUNCH_SYSTEM_ENABLED is off')
if (!/withCronHeartbeat\('launch-reminders'/.test(route) || !/rejectUnauthorizedCron/.test(route)) bad.push('the cron has no heartbeat or no auth')
if (!/resolveSendGate\([^)]*'email', 'lifecycle'/.test(io)) bad.push('the runner skips the lifecycle send gate (preferences, consent, suppression)')
if (!/launch_email_log/.test(io) || !/23505/.test(io)) bad.push('the runner does not claim a kind in launch_email_log')
if (!/enqueueEmail/.test(io) || /sendRawEmail|new Resend/.test(io + email)) bad.push('the emails do not go through the outbox send seam')
if (!/listUnsubscribeHeaders/.test(io) || !/unsubscribe: true/.test(email)) bad.push('the emails carry no unsubscribe')
if (/[—–]/.test(email)) bad.push('the email copy has a dash')
if (!/\/launch`/.test(email)) bad.push('the button does not go to /launch')
if (!/"path": "\/api\/cron\/launch-reminders"/.test(vercel)) bad.push('the cron is not scheduled')
if (!/'launch-reminders'/.test(slos)) bad.push('the cron is not declared in the monitoring contract')
if (/process\.env\.LAUNCH_[A-Z_]* === /.test(route + io)) bad.push('a switch is read by hand')
if (!/^LAUNCH_SYSTEM_ENABLED=/m.test(env)) bad.push('the switch is not listed in .env.example')
if (!/come-back/i.test(runbook)) bad.push('the RUNBOOKS gate does not name the come-back emails')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ come-back emails: 1h, 1d, 3d after they stop, max three, 8am to 8pm local, end on resume, launch, cancel or opt out')
