// The Network hub (ADR-172, P7 §10.3) hosts the two member-facing network
// surfaces: Community (the member directory, formerly /people) and My Contacts
// (the personal contact book, formerly /connections). The operator lead/subscriber
// CRM stays in the admin Growth area (/admin/marketing/contacts) — a different audience.
//
// Each surface now has its own left-rail item, so the in-page tab switcher that
// once joined them has been removed. The layout simply renders each page's content
// under its own PageHeading.
export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
