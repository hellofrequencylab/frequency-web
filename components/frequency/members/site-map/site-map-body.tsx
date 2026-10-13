import Link from 'next/link'
import { MembersBody } from '@/components/frequency/members/shared/members-body'

// THE MEMBER SITE MAP (design_handoff/frequency/templates/members/Site Map.html): the four areas of
// the member site and the pages in each, as plain links. SITE_MAP is the short list the DAWN page
// prints; FQ_SITE_MAP is the Frequency page's, the reference's four columns filled with every page the
// Frequency header's mega menu offers in that area (components/frequency/members/shell/nav.ts), so the
// map is never shorter than the menu. Every href is a live route; the reference's per-item pages (one
// Event, one Circle) are their index pages here. "Host tools" is not a link: what a member runs is
// listed in the You panel, per Space, because there is no single host door to send everyone to.

export const SITE_MAP: { area: string; links: { label: string; href: string }[] }[] = [
  {
    area: 'Home',
    links: [
      { label: 'Feed', href: '/feed' },
      { label: 'Search', href: '/search' },
      { label: 'Messages', href: '/messages' },
      { label: 'Events', href: '/events' },
    ],
  },
  {
    area: 'Community',
    links: [
      { label: 'Circles', href: '/circles' },
      { label: 'Members', href: '/people' },
      { label: 'Marketplace', href: '/marketplace' },
    ],
  },
  {
    area: 'The Quest',
    links: [
      { label: 'Journeys', href: '/journeys' },
      { label: 'Practices', href: '/practices' },
      { label: 'Mindless', href: '/on-air' },
    ],
  },
  {
    area: 'You',
    links: [
      { label: 'Profile', href: '/profile' },
      { label: 'The Vault', href: '/crew/store' },
      { label: 'Settings', href: '/settings' },
      { label: 'Help', href: '/help' },
    ],
  },
]

export const FQ_SITE_MAP: { area: string; links: { label: string; href: string }[] }[] = [
  {
    area: 'Home',
    links: [
      { label: 'Feed', href: '/feed' },
      { label: 'Around You', href: '/nearby' },
      { label: 'Search', href: '/search' },
      { label: 'Messages', href: '/messages' },
      { label: 'Events', href: '/events' },
      { label: 'Journal', href: '/journal' },
    ],
  },
  {
    area: 'Community',
    links: [
      { label: 'Circles', href: '/circles' },
      { label: 'Start a Circle', href: '/circles/new' },
      { label: 'Members', href: '/network' },
      { label: 'Channels', href: '/channels' },
      { label: 'Business Spaces', href: '/spaces/directory' },
      { label: 'Marketplace', href: '/marketplace' },
    ],
  },
  {
    area: 'The Quest',
    links: [
      { label: 'My Quest', href: '/crew' },
      { label: 'Journeys', href: '/journeys' },
      { label: 'Practices', href: '/practices' },
      { label: 'Mindless', href: '/on-air' },
      { label: 'Challenges', href: '/crew/challenges' },
      { label: 'Leaderboard', href: '/crew/leaderboard' },
    ],
  },
  {
    area: 'You',
    links: [
      { label: 'Profile', href: '/profile' },
      { label: 'My Code', href: '/codes' },
      { label: 'The Vault', href: '/crew/store' },
      { label: 'Orders', href: '/orders' },
      { label: 'Settings', href: '/settings' },
      { label: 'Help', href: '/support' },
      { label: 'Help center', href: '/help' },
    ],
  },
]

export function SiteMapBody() {
  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">Frequency</span>
          <h1 className="h1">
            Site <span className="serif">map.</span>
          </h1>
        </div>
      </div>
      <div className="g4">
        {FQ_SITE_MAP.map((col) => (
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
    </MembersBody>
  )
}
