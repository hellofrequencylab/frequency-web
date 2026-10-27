import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
export function messagesMemberControls(read = p => readFileSync(p, 'utf8')) {
  const body = read('components/frequency/members/messages/messages-body.tsx')
  assert.match(body, /<NewGroupDMCompose buttonLabel="Group message"/, 'group-message compose door missing')
  assert.match(body, /isCrewLead && <Suspense[^>]*><CrewLeadQuickAction/, 'trusted crew shortcut missing')
  assert.match(read('app/(main)/messages/page.tsx'), /isCrewLead=\{myProfile\.is_crew_lead === true\}/, 'crew flag must come from the authenticated own-profile read')
  assert.match(read('app/(main)/messages/r/[roomId]/page.tsx'), /<RoomMembers roomId=\{roomId\}[^\n]*canRead=\{canRead\}/, 'room roster must reuse the actual page read verdict')
  const roster = read('components/rooms/room-members.tsx')
  assert.match(roster, /if \(!canRead \|\| visibility === 'channel'\) return null/, 'roster read/channel boundary lost')
  assert.match(roster, /isAdmin && profile\.id !== myProfileId/, 'admin controls must exclude self')
  assert.match(roster, /isMember && \(visibility !== 'private' \|\| isAdmin\)/, 'private invite boundary lost')
  const row = read('components/rooms/member-row-actions.tsx')
  assert.match(row, /aria-expanded=\{open\}/, 'action expansion state missing')
  assert.match(row, /e\.key === 'Escape'/, 'keyboard close behavior missing')
  assert.match(row, /role="alert"/, 'mutation failures must remain visible')
  assert.doesNotMatch(row, /\balert\(/, 'blocking browser alert returned')
  const crew = read('components/messages/crew-lead-quick-action.tsx')
  assert.doesNotMatch(crew, /createAdminClient/, 'crew shortcut must not add privileged reads')
  assert.match(crew, /if \(!isCrewLead \|\| !myProfileId\) return null/, 'ordinary members must not trigger extra shortcut reads')
  assert.match(crew, /friendIds\.has\(r\.id\) && r\.id !== circle\.host_id && r\.id !== myProfileId/, 'recipient consent/self/host boundary lost')
  return true
}
if (invokedDirectly(import.meta.url)) {
  messagesMemberControls()
  console.log('Active message compose and caller-gated room controls wired; user-client crew consent and keyboard/error boundaries retained')
}
