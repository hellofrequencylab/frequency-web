import type { ElementType } from 'react'
import { CalendarDays, Users, Hash, MessageSquare, Radio } from 'lucide-react'

// The role-gated "structured" creates — the things that need their own form/page
// (an event, a circle, a room, a broadcast, a conversation), as opposed to the
// inline post types (Post / Announce) the composer hosts directly. Shared by the
// composer's launcher row and the legacy CreateMenu dropdown so the list and its
// role gating never drift.

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

const CREW_PLUS: CommunityRole[] = ['crew', 'host', 'guide', 'mentor', 'admin', 'janitor']
const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'admin', 'janitor']

export type CreateItem = {
  href: string
  label: string
  hint: string
  Icon: ElementType
  roles: CommunityRole[]
}

export const CREATE_ITEMS: CreateItem[] = [
  // A DM starts from a person, so send them to the directory to pick one (the old
  // ?compose=dm param was never read by /messages, so it dead-ended on the list).
  { href: '/network', label: 'New Conversation', hint: 'Find someone to message', Icon: MessageSquare, roles: ['member', ...CREW_PLUS] },
  { href: '/events/new', label: 'New Event', hint: 'Gathering, ride, meetup', Icon: CalendarDays, roles: CREW_PLUS },
  // /messages hosts the New Room compose button; the old ?compose=room param was never read.
  { href: '/messages', label: 'New Room', hint: 'Topic-based chat space', Icon: Hash, roles: HOST_PLUS },
  // The canonical circle builder (CircleWizard) lives at /circles/new — every other
  // "start a circle" affordance already targets it.
  { href: '/circles/new', label: 'New Circle', hint: 'Place-based practice group', Icon: Users, roles: HOST_PLUS },
  { href: '/broadcast', label: 'New Broadcast', hint: 'Dispatch to the wider community', Icon: Radio, roles: HOST_PLUS },
]

export function createItemsForRole(role: CommunityRole): CreateItem[] {
  return CREATE_ITEMS.filter((it) => it.roles.includes(role))
}
