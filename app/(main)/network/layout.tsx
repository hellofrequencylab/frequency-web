import { NetworkTabs } from '@/components/network/network-tabs'

// The Network hub (ADR-172, P7 §10.3) — one home for the two member-facing network
// surfaces: Community (the member directory, formerly /people) and My Contacts (the
// personal contact book, formerly /connections). The operator lead/subscriber CRM
// stays in Growth Studio (/marketing/contacts) — a different audience. The tab strip
// is the hub chrome; each tab page supplies its own content.
export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NetworkTabs />
      {children}
    </>
  )
}
