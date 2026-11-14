#!/usr/bin/env node
// LIVE-2283: run real pure resume decisions, without database access or a test runner.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
const { parseWizardResume, showWizardClock, ownerEntryHref } = await import('../../lib/launch/wizard-resume.ts')
const { stepsWithSkips, toSnapshot } = await import('../../lib/launch/state.ts')
const resume = parseWizardResume({ version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 2, niche: null, goals: [], timedEntry: true, draft: null, leadToken: null })
assert.ok(resume)
const snapshot = toSnapshot({ id: 'l', owner_id: 'p', started_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z', steps: stepsWithSkips({ spotlight: { status: 'published', ref: 'owned' } }, ['sc-logo'], resume, 'revision-a') })
assert.equal(snapshot.resume.cursor, 2)
assert.equal(snapshot.resume.theme, 'new-world')
assert.equal(snapshot.steps.spotlight.status, 'published')
assert.deepEqual(snapshot.skippedPhotos, ['sc-logo'])
assert.equal(snapshot.stepsRevision, 'revision-a')
assert.equal(parseWizardResume({ ...resume, cursor: 99 }), null)
assert.equal(parseWizardResume({ ...resume, draft: { offer: 'x'.repeat(17000) } }), null)
assert.equal(showWizardClock(null, 0), false)
assert.equal(showWizardClock(resume, 719999), true)
assert.equal(showWizardClock(resume, 720000), false)
assert.equal(ownerEntryHref('my-space', false), '/spaces/my-space/manage/spotlight')
assert.equal(ownerEntryHref('my-space', true), null)
console.log('shared onboarding resume: bounded cursor, preserved work, owner destination and timed visibility pass')
