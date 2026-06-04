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
  { href: '/messages?compose=dm', label: 'New Conversation', hint: 'Direct or group message', Icon: MessageSquare, roles: ['member', ...CREW_PLUS] },
  { href: '/events/new', label: 'New Event', hint: 'Gathering, ride, meetup', Icon: CalendarDays, roles: CREW_PLUS },
  { href: '/messages?compose=room', label: 'New Room', hint: 'Topic-based chat space', Icon: Hash, roles: HOST_PLUS },
  { href: '/circles/new', label: 'New Circle', hint: 'Place-based practice group', Icon: Users, roles: HOST_PLUS },
  { href: '/broadcast', label: 'New Broadcast', hint: 'Dispatch to the wider community', Icon: Radio, roles: HOST_PLUS },
]

export function createItemsForRole(role: CommunityRole): CreateItem[] {
  return CREATE_ITEMS.filter((it) => it.roles.includes(role))
}
