// THE WEBSITE'S ADMIN LINKS (owner ask 2026-10-08: "Menu should read: Home | The Year | Circles | Calendar |
// Retreat | About (Blue after this) | ADMIN: Executive Overview", then "Add blue admin section to the footer
// as well with a link to Executive Overview" and "Make the Year Calendar a blue admin link"). A Menswork
// website ends its one menu with these, in the theme's blue, and repeats them in a blue footer section. They
// show for everyone; the admin pages themselves are gated (lib/sites/site-admin.ts), so a visitor who taps
// one is sent to sign in.

export interface SiteAdminNavLink {
  href: string
  label: string
  current?: boolean
}

/** The admin links: the two admin pages, on the site's own host or through the console's handoff, then
 *  the console's Leadership page (footer only). */
export function siteAdminNavLinks(
  hrefs: { overview: string; calendar: string; editor?: string; console: string },
  current: 'overview' | 'calendar' | 'editor' | null = null,
): { menu: SiteAdminNavLink[]; console: string } {
  return {
    menu: [
      ...(hrefs.editor ? [{ href: hrefs.editor, label: 'Website builder', current: current === 'editor' }] : []),
      { href: hrefs.overview, label: 'Executive Overview', current: current === 'overview' },
      { href: hrefs.calendar, label: 'Yearly Calendar', current: current === 'calendar' },
    ],
    console: hrefs.console,
  }
}

/** The blue admin section above the footer line. */
export function SiteFooterAdmin({ links, console }: { links: SiteAdminNavLink[]; console: string }) {
  return (
    <div className="hs-admin">
      <div className="hs-admin-in">
        <span className="hs-admin-tag">Admin</span>
        <nav aria-label="Admin" className="hs-admin-nav">
          {links.map((l) => (
            <a key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined}>
              {l.label}
            </a>
          ))}
          <a href={console}>Manage on Frequency</a>
        </nav>
      </div>
    </div>
  )
}
