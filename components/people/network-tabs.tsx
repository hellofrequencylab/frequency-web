import { UnderlineTabs } from '@/components/ui/underline-tabs'

// The Network hub tab strip (ADR-172). Three sibling surfaces read as one hub:
// Members (the member directory) · Friends (relationships) · My Contacts (the CRM
// rolodex). The labels match the nav rows in lib/nav-areas.ts (docs/NAMING.md §Connection
// layer: "Members" names the directory, never "Community"; My Contacts keeps its own name).
// Each is its own server route, so this is just links — the active tab is
// resolved by pathname inside UnderlineTabs, or overridden via `active` when a page
// wants to pin it (e.g. /network with its own query params).
const HUB_TABS = [
  { href: '/network', label: 'Members' },
  { href: '/network/friends', label: 'Friends' },
  { href: '/network/contacts', label: 'My Contacts' },
] as const

export function NetworkTabs({ active }: { active?: '/network' | '/network/friends' | '/network/contacts' }) {
  return (
    <div className="mb-6">
      <UnderlineTabs tabs={[...HUB_TABS]} activeHref={active} />
    </div>
  )
}
