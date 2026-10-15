import { IndexHeader } from '@/components/templates/index-header'
import Link from 'next/link'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { FQ_SITE_LINKS } from '@/components/frequency/members/shell/nav'
import { NAV_AREAS, meetsAccess, meetsStaff, type NavAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/core/roles'
import type { StaffDomain, StaffRole } from '@/lib/core/staff-roles'
import type { DesignId } from '@/lib/theme/design'

// THE MEMBER SITE MAP (design_handoff/frequency/templates/members/Site Map.html): every place the
// member chrome links to, grouped the way the menus group it, as plain links. ONE list for both
// designs: DAWN prints it in an Index shell, Frequency in the reference's page.
//
// "Every place" means the union of the live (DAWN) chrome and the Frequency header: the left rail
// (lib/nav-areas NAV_AREAS), the account menu and the member footer (lib/nav/registry), My Frequency
// (lib/nav/my-frequency-rows), the header and drawer links, and the right rail's "See all" doors.
// components/frequency/members/shell/nav-coverage.test.ts collects that set from those modules and
// fails when one is missing here, and site-map-body.test.ts does the same for the Frequency header.
//
// GATED LIKE THE MENUS. A link carries the gate its menu row carries (the two-axis gate, ADR-390:
// a ladder floor unioned with a staff capability). The Admin column is not copied: it is the rail's
// own Admin section, gates and all, read from NAV_AREAS, so a member never sees it and an operator
// sees exactly the rows their rail shows. Every href is a live route (both tests check).
//
// THE WEBSITE row is the public pages. Under Frequency it also carries the mega menu's site row
// (FQ_SITE_LINKS, read from the shell's nav, never copied); Features, Stories and Vision are
// Frequency-only routes (a DAWN build answers 404), so the DAWN page leaves them out.

interface SiteMapGate {
  minAccess: NavAccess
  staffDomain?: StaffDomain
}

interface SiteMapLink {
  label: string
  href: string
  /** Absent = every signed-in member. */
  gate?: SiteMapGate
}

interface SiteMapColumn {
  area: string
  links: SiteMapLink[]
}

const MEMBER: SiteMapGate = { minAccess: 'member' }
const HOST: SiteMapGate = { minAccess: 'host' }

/** The rail's Admin section, verbatim: label, href and gate (staff and host+ only). */
const ADMIN_LINKS: SiteMapLink[] = NAV_AREAS.filter((a) => a.section === 'Admin').map((a) => ({
  label: a.label,
  href: a.href,
  gate: { minAccess: a.defaultAccess, ...(a.staffDomain ? { staffDomain: a.staffDomain } : {}) },
}))

export const SITE_MAP: SiteMapColumn[] = [
  {
    area: 'Home',
    links: [
      { label: 'Feed', href: '/feed' },
      { label: 'Around You', href: '/nearby' },
      { label: 'Search', href: '/search' },
      { label: 'Messages', href: '/messages', gate: MEMBER },
      { label: 'Journal', href: '/journal', gate: MEMBER },
      { label: 'Drafts', href: '/drafts', gate: MEMBER },
    ],
  },
  {
    area: 'Community',
    links: [
      { label: 'Circles', href: '/circles' },
      { label: 'Start a Circle', href: '/circles/new' },
      { label: 'Starter Circles', href: '/circles/templates', gate: MEMBER },
      { label: 'Events', href: '/events' },
      { label: "What's happening", href: '/events/calendar' },
      { label: 'New event', href: '/events/new' },
      { label: 'Channels', href: '/channels' },
      { label: 'Members', href: '/network', gate: MEMBER },
      { label: 'People', href: '/people', gate: MEMBER },
      { label: 'Friends', href: '/network/friends' },
      { label: 'My Contacts', href: '/network/contacts', gate: MEMBER },
      { label: 'Business Spaces', href: '/spaces/directory', gate: MEMBER },
      { label: 'All your Spaces', href: '/spaces/operating', gate: MEMBER },
      { label: 'Partners', href: '/partners', gate: MEMBER },
    ],
  },
  {
    area: 'Marketplace',
    links: [
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Classifieds', href: '/classifieds' },
      { label: 'Post a listing', href: '/classifieds/new', gate: MEMBER },
      { label: 'Market', href: '/market' },
      { label: 'Housing', href: '/housing', gate: MEMBER },
      { label: 'Frequency Store', href: '/store' },
      { label: 'List a product', href: '/market/sell', gate: MEMBER },
      { label: 'My storefront', href: '/market/manage', gate: HOST },
    ],
  },
  {
    area: 'The Quest',
    links: [
      { label: 'My Quest', href: '/crew', gate: MEMBER },
      { label: 'Journeys', href: '/journeys', gate: MEMBER },
      { label: 'Practices', href: '/practices', gate: MEMBER },
      { label: 'Mindless', href: '/on-air' },
      { label: 'Challenges', href: '/crew/challenges' },
      { label: 'Leaderboard', href: '/crew/leaderboard', gate: MEMBER },
      { label: 'The Vault', href: '/crew/store', gate: MEMBER },
    ],
  },
  {
    area: 'You',
    links: [
      { label: 'Profile', href: '/profile' },
      { label: 'My Code', href: '/codes' },
      { label: 'Orders', href: '/orders', gate: MEMBER },
      { label: 'Entry points', href: '/entry-points' },
      { label: 'Join Crew', href: '/upgrade' },
    ],
  },
  {
    area: 'Account',
    links: [
      { label: 'Settings', href: '/settings' },
      { label: 'Edit profile', href: '/settings/profile', gate: MEMBER },
      { label: 'Notifications', href: '/settings#notifications' },
      { label: 'Billing & Plans', href: '/settings/billing' },
      { label: 'Receive payments', href: '/settings#payouts', gate: HOST },
      { label: 'Help center', href: '/help' },
      { label: 'Support tickets', href: '/support', gate: MEMBER },
    ],
  },
  { area: 'Admin', links: ADMIN_LINKS },
]

/** The public pages a DAWN build serves, in the member footer's order. */
const WEBSITE_LINKS: SiteMapLink[] = [
  { label: 'Home', href: '/?home' },
  { label: 'What is Frequency', href: '/what-is-frequency' },
  { label: 'About', href: '/about' },
  { label: 'The Community', href: '/the-community' },
  { label: 'Spaces', href: '/spaces' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Compare', href: '/vs' },
  { label: 'Help Center', href: '/help' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Guidelines', href: '/guidelines' },
]

/** The website row for a design: the public pages, plus the Frequency mega menu's site row there. */
export function websiteLinks(design: DesignId): SiteMapLink[] {
  if (design !== 'frequency') return WEBSITE_LINKS
  const seen = new Set<string>()
  return [...FQ_SITE_LINKS, ...WEBSITE_LINKS].filter((l) => !seen.has(l.href) && !!seen.add(l.href))
}

/** The viewer the map gates against: the ladder role (null = visitor preview) and the staff role. */
interface SiteMapViewer {
  role: CommunityRole | null
  staffRole: StaffRole | null
}

/** The same two-axis union the rail applies (meetsAccess or meetsStaff). */
export function canSeeLink(link: SiteMapLink, viewer: SiteMapViewer): boolean {
  if (!link.gate) return true
  return meetsAccess(link.gate.minAccess, viewer.role) || meetsStaff(link.gate, viewer.staffRole)
}

/** The map as this viewer may see it: hidden links dropped, then empty columns dropped. */
export function siteMapFor(viewer: SiteMapViewer): SiteMapColumn[] {
  return SITE_MAP.map((col) => ({ ...col, links: col.links.filter((l) => canSeeLink(l, viewer)) })).filter(
    (col) => col.links.length > 0,
  )
}

export function SiteMapBody({ columns, website }: { columns: SiteMapColumn[]; website: SiteMapLink[] }) {
  return (
    <MembersBody>
      <IndexHeader title={<>Site <span className="serif">map.</span></>} eyebrow="Frequency" adminBar={false} />
      <div className="g4">
        {columns.map((col) => (
          <nav key={col.area} className="stack mc-gap-4" aria-label={col.area}>
            <span className="k mc-k-gap">{col.area}</span>
            {col.links.map((l) => (
              <Link key={l.href} className="mc-maplink" href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <nav className="sec stack mc-gap-4" aria-label="The website">
        <span className="k mc-k-gap">The website</span>
        <div className="row wrap mc-site-links">
          {website.map((l) => (
            <Link key={l.href} className="mc-maplink" href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </MembersBody>
  )
}
