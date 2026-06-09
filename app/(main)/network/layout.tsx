import { NetworkHubTabs } from '@/components/network/network-hub-tabs'

// The Network hub (ADR-172, P7 §10.3) — one home for the two member-facing network
// surfaces: Community (the member directory, formerly /people) and My Contacts (the
// personal contact book, formerly /connections). The operator lead/subscriber CRM
// stays in Growth Studio (/marketing/contacts) — a different audience.
//
// Hub chrome (the tab strip) lives here for every surface EXCEPT the Community
// index, which renders the tabs inline under its own page header (header →
// divider → tabs → content). <NetworkHubTabs> withholds the strip on `/network`
// for exactly that reason; each tab page supplies its own content.
export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NetworkHubTabs />
      {children}
    </>
  )
}
