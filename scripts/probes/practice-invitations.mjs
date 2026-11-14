#!/usr/bin/env node
// LIVE-2292: an explicit choice opens a real practice door; rest and dismissal create no activity.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRACTICE_SUPPORT_CHOICES, practiceInvitationFor } from '../../lib/practices/invitations.ts'

assert.deepEqual(PRACTICE_SUPPORT_CHOICES.map((choice) => choice.id), ['mind', 'body', 'spirit', 'expression'])
for (const choice of PRACTICE_SUPPORT_CHOICES) {
  const invitation = practiceInvitationFor(choice.id)
  assert.equal(invitation.kind, 'explore')
  assert.equal(invitation.href, `/discover/practices/pillar/${choice.id}`)
  assert.ok(invitation.action.startsWith('Explore '))
}
assert.equal(practiceInvitationFor('familiar').href, '/practices')
assert.equal(practiceInvitationFor('rest').kind, 'rest')
assert.equal('href' in practiceInvitationFor('rest'), false)
for (const invalid of [null, {}, [], '__proto__', 'constructor', 'low-spirit', 'https://example.com']) {
  assert.equal(practiceInvitationFor(invalid), null)
}
const component = readFileSync('components/practice/practice-invitation.tsx', 'utf8')
assert.ok(component.includes('What would support you today?'))
assert.ok(component.includes('practiceInvitationFor(choice)'))
assert.ok(component.includes('setDismissed(true)'))
assert.doesNotMatch(component, /localStorage|sessionStorage|fetch\(|logPractice|trackEvent|captureEvent/)
for (const path of ['app/(main)/feed/page.tsx', 'app/(main)/practices/page.tsx']) {
  assert.match(readFileSync(path, 'utf8'), /<PracticeInvitation\b/)
}
console.log('practice invitations: explicit safe library doors, optional rest, ephemeral state and real entry integration pass')
