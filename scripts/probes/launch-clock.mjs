#!/usr/bin/env node
// LIVE-1873: the 12 minute launch clock is real. It is kept on the launch row, a heartbeat can only add the time since the
// last one (30 seconds at most, so a closed tab cannot run the clock), the page pauses it when hidden or idle, and both
// launch pages show it. Runs the pure rules under node and reads the migration, the types and the wiring.
import { readFileSync, readdirSync } from 'node:fs'
import { applyBeat, clockView } from '../../lib/launch/clock.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')

const T = new Date('2026-10-29T12:00:00Z')
const ago = (ms) => new Date(T.getTime() - ms).toISOString()
if (applyBeat({ activeMs: 0, lastBeatAt: ago(3_600_000) }, 'beat', T).activeMs !== 30_000) bad.push('a beat after a long gap adds more than 30 seconds')
if (applyBeat({ activeMs: 0, lastBeatAt: ago(600_000) }, 'start', T).activeMs !== 0) bad.push('a start adds time')
if (applyBeat({ activeMs: 0, lastBeatAt: ago(10_000) }, 'stop', T).lastBeatAt !== null) bad.push('a stop leaves the clock running')
if (applyBeat({ activeMs: 9, lastBeatAt: null }, 'beat', T).activeMs !== 9) bad.push('a beat with no start invents time')
const bonus = clockView({ activeMs: 12 * 60_000 + 5_000, done: 1, total: 5, running: true })
if (!bonus.bonus || bonus.label !== '0:05') bad.push('past 12:00 the clock does not turn to bonus time')

const file = readdirSync('supabase/migrations').find((f) => f.endsWith('_launch_clock.sql'))
if (!file || file <= '20270346027100') bad.push('no launch_clock migration after 20270346027100')
const sql = file ? read(`supabase/migrations/${file}`) : ''
if (!/add column if not exists clock_active_ms integer not null default 0/.test(sql)) bad.push('clock_active_ms is not on the launch row')
if (!/add column if not exists clock_last_beat_at timestamptz/.test(sql)) bad.push('clock_last_beat_at is not on the launch row')
if (/create policy|grant /.test(sql)) bad.push('the migration changes who can read the row; the owner-only policies must stay as they are')

const types = read('lib/database.types.ts')
const at = types.indexOf('      space_launch: {')
const block = types.slice(at, types.indexOf('Relationships:', at))
if (!/clock_active_ms: number/.test(block) || !/clock_last_beat_at: string \| null/.test(block)) bad.push('lib/database.types.ts lacks the clock columns')

const io = read('lib/launch/clock-io.ts')
if (!/applyBeat\(/.test(io)) bad.push('the heartbeat is written without the cap')
if (!/\.eq\('owner_id', ownerId\)/.test(io)) bad.push('the heartbeat does not name its owner')
const actions = read('lib/launch/actions.ts')
if (!/export async function clockBeatAction/.test(actions) || !/const who = await mine\(\)/.test(actions.slice(actions.indexOf('clockBeatAction')))) bad.push('the heartbeat action is not behind the launch switch and sign in')

const live = read('components/launch/launch-clock-live.tsx')
if (!/visibilitychange/.test(live) || !/IDLE_AFTER_MS/.test(live) || !/IntersectionObserver/.test(live)) bad.push('the clock does not pause when hidden or idle, or does not swap hero for pill')
if (!/Bonus time\. Keep going, you are close\./.test(read('components/launch/launch-clock.tsx'))) bad.push('the bonus time cheer is missing')
for (const f of ['app/(main)/launch/page.tsx', 'app/(main)/launch/step/spotlight/page.tsx']) if (!/<LaunchClockSlot/.test(read(f))) bad.push(`${f} does not show the clock`)
for (const f of ['components/launch/launch-clock.tsx', 'components/launch/launch-clock-live.tsx']) if (/—/.test(read(f))) bad.push(`${f} has an em dash in copy`)

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the launch clock is kept on the row, capped per beat, paused when away, and shown on both launch pages')
