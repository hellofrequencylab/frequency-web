import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// SOURCE-SHAPE pins for "Mute a Circle or Space" actually muting (meta-scan B9 D2, 2026-09-04).
//
// The gate honours a per-subject mute ONLY when the send names its subject
// (lib/comms/send-gate.ts `options.subject`). The settings card wrote 21 rows per mute and NO
// production send constructed a PreferenceSubject, so every one of those rows was read by nothing.
// The behavioural half lives beside each site where one exists (lib/spaces/dispatch.test.ts asserts
// the recipient the router receives; lib/comms/send-gate.test.ts proves the gate denies on a mute).
// What is left to pin is that each fan-out with a Space/Circle in scope passes it, because the
// defect was precisely an argument that existed and was never supplied.

const read = (p: string) => readFileSync(path.join(__dirname, '..', '..', p), 'utf8')

describe('every fan-out with a Space or Circle in scope names it as the subject', () => {
  it('a Space Dispatch names the Space (the sharpest instance: spaceId was one line above)', () => {
    const src = read('lib/spaces/dispatch.ts')
    expect(src).toContain("const subject: PreferenceSubject = { subjectType: 'space', subjectId: spaceId }")
    expect(src).toContain('{ profileId, subject },')
    expect(src).not.toMatch(/routeNotification\(\s*'event\.dispatch',\s*\{ profileId \},/)
  })

  it('an Event Dispatch names the hosting Circle on BOTH the push and the email leg', () => {
    const src = read('lib/events/dispatch.ts')
    expect(src).toContain('async function eventMuteSubject(')
    expect(src).toMatch(/subjectType: 'circle', subjectId: data\.scope_id/)
    // Two call sites: fanOutEventPush and fanOutEventEmail. A third fan-out added without one is
    // the regression this pins.
    expect(src.match(/await eventMuteSubject\(/g)?.length ?? 0).toBe(2)
    expect(src).toContain('{ profileId, subject },')
    expect(src).toContain("resolveSendGate(p.id, 'email', 'dispatches', { email: user.email, subject })")
  })

  it('a member Dispatch names its Circle on both channels (nearby + admin publish)', () => {
    for (const file of ['app/(main)/nearby/actions.ts', 'app/(main)/admin/actions.ts']) {
      const src = read(file)
      expect(src, file).toMatch(/subjectType: 'circle', subjectId: (dispatch\.)?audience_id/)
      expect(src, file).toContain("'email', 'dispatches', { email")
      expect(src, file).toMatch(/'email', 'dispatches', \{ email[^}]*subject \}/)
      expect(src, file).toContain("}, 'dispatches', { subject })")
    }
  })

  it('a follower reminder names the Space whose event it is', () => {
    const src = read('lib/events/follower-reminders.ts')
    expect(src).toContain("subject: { subjectType: 'space', subjectId: ev.space_id as string }")
  })

  it('Space 1:1 outreach and email drafts name the Space', () => {
    expect(read('lib/spaces/email-drafts.ts')).toContain("subject: { subjectType: 'space', subjectId: spaceId }")
    expect(read('app/(main)/spaces/[slug]/crm/conversations-actions.ts')).toContain(
      "subject: { subjectType: 'space', subjectId: gate.spaceId }",
    )
  })

  it('sendPushToProfile forwards a subject to the gate, so push fan-outs can honour a mute', () => {
    const src = read('lib/push.ts')
    expect(src).toContain("resolveSendGate(profileId, 'push', category, { subject: options.subject })")
  })

  it('the gate still only consults the mute when a subject is supplied (the seam is unchanged)', () => {
    const src = read('lib/comms/send-gate.ts')
    expect(src).toContain('options.subject != null')
    expect(src).toContain('await isSubjectTopicMuted(profileId, options.subject, category as NotificationTopic, channel)')
  })
})
