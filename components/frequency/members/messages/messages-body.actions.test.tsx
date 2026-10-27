import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('@/app/themes/active/members-a', () => ({}))
vi.mock('@/app/themes/active/members-b', () => ({}))
vi.mock('@/app/(main)/messages/inbox-data', () => ({ loadInbox: async () => ({ allItems: [], totalUnread: 0, channelRooms: [], discoverRooms: [], onlineIds: new Set() }) }))
vi.mock('@/components/compose/new-room-compose', () => ({ NewRoomCompose: ({ buttonLabel }: { buttonLabel: string }) => <button>{buttonLabel}</button> }))
vi.mock('@/components/compose/new-group-dm-compose', () => ({ NewGroupDMCompose: ({ buttonLabel }: { buttonLabel: string }) => <button>{buttonLabel}</button> }))
vi.mock('@/components/messages/crew-lead-quick-action', () => ({ CrewLeadQuickAction: () => <button>Circle friends shortcut</button> }))
vi.mock('@/components/templates/page-heading', () => ({ PageHeading: ({ actions }: { actions: ReactNode }) => <header>{actions}</header> }))
vi.mock('../shared/toast', () => ({ FqToaster: () => null }))
vi.mock('./inbox-list', () => ({ InboxList: () => null }))
vi.mock('./ask-vera-button', () => ({ AskVeraButton: () => null }))
import { FrequencyMessages } from './messages-body'
const supabase = {} as Parameters<typeof FrequencyMessages>[0]['supabase']
it('the actual inbox renders the group-message and room doors, but no crew shortcut for ordinary members', async () => {
  const html = renderToStaticMarkup(await FrequencyMessages({ supabase, myProfileId: 'me' }))
  expect(html).toContain('Group message'); expect(html).toContain('Start a room'); expect(html).not.toContain('Circle friends shortcut')
})
it('the actual inbox mounts the trusted lead shortcut while a thread pane does not', async () => {
  const lead = renderToStaticMarkup(await FrequencyMessages({ supabase, myProfileId: 'me', isCrewLead: true }))
  expect(lead).toContain('Circle friends shortcut')
  const thread = renderToStaticMarkup(await FrequencyMessages({ supabase, myProfileId: 'me', isCrewLead: true, pane: <main>Thread</main> }))
  expect(thread).not.toContain('Circle friends shortcut'); expect(thread).not.toContain('Group message'); expect(thread).toContain('Thread')
})
