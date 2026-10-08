// THE WEBSITE ADMIN ROW (owner ask 2026-10-08: "Let's keep the same header / menu through the site.
// Instead of an admin button, make it a double menu with admin settings in blue. Leave a note about admin
// view only."). A second, blue row under a Menswork website's own header: the admin pages, the console's
// Leadership page as a clearly labelled Frequency link, and a note that visitors never see it. The admin
// pages draw it on the server; the public pages draw it through SiteAdminBarGate, only for a browser
// that came in through the console's handoff. Its look (menswork-css.ts): the theme's blue (the signal
// token), 40px tall, one line that scrolls sideways on a phone, so the admin pages can pin their rails under
// a header of known height.

export interface SiteAdminNavLink {
  href: string
  label: string
  current?: boolean
}

/** The row's links: the two admin pages on the site's own host, then the console. */
export function siteAdminNavLinks(consoleHref: string, current: 'overview' | 'calendar' | null = null): SiteAdminNavLink[] {
  return [
    { href: '/admin/overview', label: 'Executive Overview', current: current === 'overview' },
    { href: '/admin/calendar', label: 'Yearly Calendar', current: current === 'calendar' },
    { href: consoleHref, label: 'Manage on Frequency' },
  ]
}

export function SiteAdminBar({ links }: { links: SiteAdminNavLink[] }) {
  return (
    <div className="hs-admin">
      <div className="hs-admin-in">
        <span className="hs-admin-tag">Admin view only</span>
        <nav aria-label="Admin" className="hs-admin-nav">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hs-nav-admin" aria-current={l.current ? 'page' : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <span className="hs-admin-note">Visitors never see this menu.</span>
      </div>
    </div>
  )
}
