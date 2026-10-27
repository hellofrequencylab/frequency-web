import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { messagesMemberControls } from './probes/messages-member-controls.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
it('holds actual active message and roster wiring', () => expect(messagesMemberControls()).toBe(true))
it.each([
  ['components/frequency/members/messages/messages-body.tsx', '<NewGroupDMCompose buttonLabel="Group message"', '<RetiredCompose buttonLabel="Group message"'],
  ['components/rooms/room-members.tsx', "if (!canRead || visibility === 'channel') return null", 'if (false) return null'],
  ['components/rooms/room-members.tsx', 'isAdmin && profile.id !== myProfileId', 'true'],
  ['components/rooms/room-members.tsx', "isMember && (visibility !== 'private' || isAdmin)", 'isMember'],
  ['components/rooms/member-row-actions.tsx', 'role="alert"', 'role="presentation"'],
  ['components/messages/crew-lead-quick-action.tsx', 'friendIds.has(r.id)', 'true'],
  ['app/(main)/messages/page.tsx', 'myProfile.is_crew_lead === true', 'true'],
])('rejects actual wiring/permission/consent regression in %s', (file, old, changed) => {
  expect(read(file)).toContain(old)
  expect(() => messagesMemberControls(p => p === file ? read(p).replaceAll(old, changed) : read(p))).toThrow()
})
