import { UnderlineTabs } from '@/components/admin/underline-tabs'

// The Network hub tab strip (ADR-172). Three sibling surfaces read as one hub:
// Community (the member directory) · Friends (relationships) · Contacts (the CRM
// rolodex). Each is its own server route, so this is just links — the active tab is
// resolved by pathname inside UnderlineTabs, or overridden via `active` when a page
// wants to pin it (e.g. /network with its own query params).
const HUB_TABS = [
  { href: '/network', label: 'Community' },
  { href: '/network/friends', label: 'Friends' },
  { href: '/network/contacts', label: 'Contacts' },
] as const

export function NetworkTabs({ active }: { active?: '/network' | '/network/friends' | '/network/contacts' }) {
  return (
    <div className="mb-6">
      <UnderlineTabs tabs={[...HUB_TABS]} activeHref={active} />
    </div>
  )
}
