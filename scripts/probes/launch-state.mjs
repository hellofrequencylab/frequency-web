#!/usr/bin/env node
// VLS-01: the launch remembers where a person stopped, and cancel takes two calls.
//
// Runs lib/launch/state.ts under node with no database. Fails when a launch published at step 1 and
// abandoned at step 3 does not reload with the cursor at step 3 and step 1 still published, when a single
// cancel call (or a wrong word, or a stale request) ends a launch, or when a required step can be skipped.
import { CANCEL_WINDOW_MS, canConfirmCancel, publishStep, resumeStep, skipStep, startStep, toSnapshot } from '../../lib/launch/state.ts'

const bad = []
const t0 = new Date('2026-10-28T12:00:00Z')
const at = (ms) => new Date(t0.getTime() + ms)

let steps = publishStep(startStep({}, 'spotlight', t0), 'spotlight', at(1000), 'a-space')
steps = publishStep(startStep(steps, 'space', at(2000)), 'space', at(3000))
steps = startStep(steps, 'offer', at(4000))
const row = { id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: at(4000).toISOString(), niche: 'coaches', intents: [], steps, current_step: 'offer' }
const back = toSnapshot(JSON.parse(JSON.stringify(row)))
if (back?.currentStep !== 'offer') bad.push('the cursor is not where the person stopped')
if (back?.steps.spotlight?.status !== 'published') bad.push('a published step did not survive a reload')
if (resumeStep('coaches', [], back?.steps ?? {}) !== 'offer') bad.push('resume does not land on the first unsettled step')

const open = { cancelRequestedAt: null, cancelledAt: null, completedAt: null }
if (canConfirmCancel(open, 'STOP', t0).ok) bad.push('one cancel call ended the launch')
const requested = { ...open, cancelRequestedAt: t0.toISOString() }
if (canConfirmCancel(requested, 'yes', at(1000)).ok) bad.push('a wrong word ended the launch')
if (canConfirmCancel(requested, 'STOP', at(CANCEL_WINDOW_MS + 1)).ok) bad.push('a stale request ended the launch')
if (!canConfirmCancel(requested, 'STOP', at(1000)).ok) bad.push('request then the typed word does not cancel')
for (const id of ['spotlight', 'space', 'website', 'people']) if (skipStep({}, id, t0)) bad.push(`required step ${id} can be skipped`)

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ a launch saves, resumes where it stopped, and cancels only in two calls')
