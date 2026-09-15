import type { ElementType } from 'react'
import { CalendarDays, Users, Hash, MessageSquare, Radio } from 'lucide-react'

// The role-gated "structured" creates — the things that need their own form/page
// (an event, a circle, a room, a broadcast, a conversation), as opposed to the
// inline post types (Post / Announce) the composer hosts directly. Shared by the
// desktop feed's CreateMenu dropdown and the mobile Create sheet behind the raised
// centre button (components/layout/create-button.tsx, LIVE-247) so the list and its
// role gating never drift.
//
// EVENT AND CIRCLE ARE OPEN TO EVERY MEMBER. `canCreate` (lib/core/capabilities.ts) grants
// `event.create` and `circle.create` to any signed-in member, /events/new has no role wall
// and /circles/new redirects only the signed-out (LIVE-266). This list gated both to Crew
// and Host after those doors opened, so the desktop menu hid two creations the member could
// reach by URL, and the mobile sheet would have hidden them from the people it exists for.
// What a free member may PUBLISH is still a quantity (the meters in feature-meters.ts),
// enforced where the thing goes live, never in a menu.

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

const CREW_PLUS: CommunityRole[] = ['crew', 'host', 'guide', 'mentor', 'admin', 'janitor']
const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'admin', 'janitor']
const EVERYONE: CommunityRole[] = ['member', ...CREW_PLUS]

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
  { href: '/network', label: 'New Conversation', hint: 'Find someone to message', Icon: MessageSquare, roles: EVERYONE },
  { href: '/events/new', label: 'New Event', hint: 'Gathering, ride, meetup', Icon: CalendarDays, roles: EVERYONE },
  // /messages hosts the New Room compose button; the old ?compose=room param was never read.
  { href: '/messages', label: 'New Room', hint: 'Topic-based chat space', Icon: Hash, roles: HOST_PLUS },
  // The canonical circle builder (CircleWizard) lives at /circles/new — every other
  // "start a circle" affordance already targets it.
  { href: '/circles/new', label: 'New Circle', hint: 'Place-based practice group', Icon: Users, roles: EVERYONE },
  { href: '/nearby', label: 'New Dispatch', hint: 'Reach the wider community', Icon: Radio, roles: HOST_PLUS },
]

export function createItemsForRole(role: CommunityRole): CreateItem[] {
  return CREATE_ITEMS.filter((it) => it.roles.includes(role))
}
