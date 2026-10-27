import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('./invite-to-room-button', () => ({ InviteToRoomButton: () => <button>Invite a person</button> }))
vi.mock('./member-row-actions', () => ({ MemberRowActions: ({ memberId }: { memberId: string }) => <button data-member-id={memberId}>Member controls</button> }))
import { RoomMembers } from './room-members'
const members = [{ is_admin: true, profile: { id: 'me', display_name: 'Me', handle: 'me', avatar_url: null } }, { is_admin: false, profile: { id: 'other', display_name: 'Other', handle: 'other/person', avatar_url: null } }]
const props = { roomId: 'room', myProfileId: 'me', canRead: true, isMember: true, isAdmin: true, visibility: 'private' as const, members, totalMembers: 3 }
it('does not reveal a roster or controls when the actual read gate refuses it, or in Channel rooms', () => {
  expect(renderToStaticMarkup(RoomMembers({ ...props, canRead: false }))).toBe('')
  expect(renderToStaticMarkup(RoomMembers({ ...props, visibility: 'channel' }))).toBe('')
})
it('an admin can invite and manage others, never self, with encoded member links and bounded roster copy', () => {
  const html = renderToStaticMarkup(RoomMembers(props))
  expect(html).toContain('Invite a person'); expect(html).toContain('data-member-id="other"'); expect(html).not.toContain('data-member-id="me"')
  expect(html).toContain('/people/other%2Fperson'); expect(html).toContain('Showing 2 of 3 members')
})
it('ordinary private-room members see the roster but no invite or admin controls', () => {
  const html = renderToStaticMarkup(RoomMembers({ ...props, isAdmin: false }))
  expect(html).toContain('Other'); expect(html).not.toContain('Invite a person'); expect(html).not.toContain('Member controls')
})
it('ordinary public-room members may invite, while nonmembers get no invite control', () => {
  expect(renderToStaticMarkup(RoomMembers({ ...props, visibility: 'public', isAdmin: false }))).toContain('Invite a person')
  expect(renderToStaticMarkup(RoomMembers({ ...props, visibility: 'public', isMember: false, isAdmin: false }))).not.toContain('Invite a person')
})
