// THE WEBSITE'S ADMIN LINKS (owner ask 2026-10-08: "Menu should read: Home | The Year | Circles | Calendar |
// Retreat | About (Blue after this) | ADMIN: Executive Overview", then "Add blue admin section to the footer
// as well with a link to Executive Overview" and "Make the Year Calendar a blue admin link"). A Menswork
// website ends its one menu with these, in the theme's blue, and repeats them in a blue footer section. They
// show only to the Space's admins (SCAN-970): the cached page asks `check` after it loads
// (site-admin-gate.tsx), and the admin pages themselves stay gated (lib/sites/site-admin.ts).
import { SiteAdminOnly } from './site-admin-gate'

export interface SiteAdminNavLink {
  href: string
  label: string
  current?: boolean
  /** Listed in the footer's admin section only, not the header. */
  footerOnly?: boolean
}

/** The admin links: the two admin pages, on the site's own host or through the console's handoff, then
 *  the console's Leadership page (footer only). The Wildheart theme names the same two pages the way its
 *  handoff does (Vision, Calendar) in its admin chip; the Website builder rides the footer section only. */
/** The Network theme lists the Website builder alone: Executive Overview and the Yearly Calendar are the Bold
 *  sites' operating pages, not a Network site's (owner ruling 2026-10-14). Its header draws the link as its
 *  own admin chip, apart from the site's menu (components/sites/network-css.ts). */
export function siteAdminNavLinks(
  hrefs: { overview: string; calendar: string; editor?: string; console: string; check?: string },
  current: 'overview' | 'calendar' | 'editor' | null = null,
  theme?: 'wildheart' | 'network',
): { menu: SiteAdminNavLink[]; console: string; check?: string } {
  const wild = theme === 'wildheart'
  const check = hrefs.check ? { check: hrefs.check } : {}
  if (theme === 'network') return { menu: hrefs.editor ? [{ href: hrefs.editor, label: 'Website builder', current: current === 'editor' }] : [], console: hrefs.console, ...check }
  return {
    ...check,
    menu: [
      ...(hrefs.editor ? [{ href: hrefs.editor, label: 'Website builder', current: current === 'editor', footerOnly: wild }] : []),
      { href: hrefs.overview, label: 'Executive Overview', current: current === 'overview', ...(wild ? { label: 'Vision' } : {}) },
      { href: hrefs.calendar, label: 'Yearly Calendar', current: current === 'calendar', ...(wild ? { label: 'Calendar' } : {}) },
    ],
    console: hrefs.console,
  }
}

/** The blue admin section above the footer line, drawn only for a reader `check` confirms as an admin. */
export function SiteFooterAdmin({ links, console, check }: { links: SiteAdminNavLink[]; console: string; check?: string | null }) {
  return (
    <SiteAdminOnly check={check}>
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
    </SiteAdminOnly>
  )
}
