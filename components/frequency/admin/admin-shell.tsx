import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { ConsoleSlide } from './console-slide'
import { AdminCrumb, AdminNav, AdminNavList, AdminPhoneBar, AdminPhoneStrip, AdminTopMenu } from './admin-nav'
import type { AdminNavItem } from './nav-model'
import '@/app/themes/active/kit-members'
import '@/app/themes/active/kit-admin'
import '@/app/themes/active/admin-shell'
import '@/app/themes/active/admin-pages'

// THE FREQUENCY ADMIN SHELL (design_handoff/frequency/templates/admin/shell.js, HANDOFF "Member Admin"). The
// 264px glass sidebar (logo, the Space switcher, the navigation with the Moderation badge, Back to Frequency
// and Help) and the sticky top bar (breadcrumb, search, alerts, avatar), around `<main class="ad-main">`.
// The top bar also carries a short row of links back to the important places (owner, 2026-10-13: "some
// header links back to important places"): the builders pick them, the shell only draws them.
//
// It wears TWO kits, nested, because the admin templates load both sheets: the member kit (buttons, panels,
// type, the top bar's search / alert / avatar pieces) and the admin kit (the shell, KPI cards, tables,
// pills). Kit class names are the design's, verbatim. A Server Component: it holds no state; only the nav
// and the breadcrumb are client islands, because the active row follows the URL.
//
// It never decides WHAT is in the menu. Every row arrives from a builder that projects a registered catalog
// (admin-console.tsx: the admin_header menu; space-console.tsx: the Space hub tabs over SPACE_MODULES).

export interface AdminShellSpace {
  name: string
  /** "Space · Owner", "Frequency · Staff". */
  role: string
  avatarUrl: string | null
  /** Other consoles this person can switch to (their real operated Spaces); empty hides the switcher. */
  switchTo: { key: string; label: string; href: string; avatarUrl: string | null }[]
}

export interface AdminShellLink {
  key: string
  label: string
  href: string
  /** Off the app (the Space's own domain): a plain anchor in a new tab. */
  external?: boolean
}

export interface AdminShellProps {
  /** The console's home (the phone top bar's who-is-this link). The sidebar wordmark goes to the Feed. */
  homeHref: string
  /** The breadcrumb's first word (the Space, or Frequency for the operator console). */
  crumbRoot: string
  navLabel: string
  space: AdminShellSpace
  items: AdminNavItem[]
  search: { href: string; label: string }
  alerts: { href: string; unread: number }
  /** The top bar's way back to the important places (the public page, the Feed, Help). Inline on a wide
   *  screen; folded into a ⋯ menu under 1100px. Each builder decides which apply (the website only when
   *  the Space has one). */
  links?: AdminShellLink[]
  /** Draw the active section's pages as a menu across the top of every page (the operator console), and keep
   *  the sidebar to one row per section. Off, the pages sit under the active sidebar row (the Space console). */
  topMenu?: boolean
  me: { name: string; avatarUrl: string | null; href: string }
  /** The member rail already owns main#main. Standalone shells keep their own landmark. */
  withinMain?: boolean
  children: ReactNode
}

function bg(url: string | null) {
  return url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined
}

function SpaceCard({ space }: { space: AdminShellSpace }) {
  const body = (
    <>
      <span className="av" style={bg(space.avatarUrl)} aria-hidden />
      <span className="grow">
        <span className="t1" style={{ display: 'block' }}>{space.name}</span>
        <span className="t2">{space.role}</span>
      </span>
    </>
  )
  if (space.switchTo.length === 0) return <div className="ad-space">{body}</div>
  return (
    <details className="ad-switch">
      <summary className="ad-space">
        {body}
        <span className="sr-only">Switch console</span>
        <FqIcon name="chevron" className="ad-switch-caret" />
      </summary>
      <div className="ad-switch-menu">
        {space.switchTo.map((option) => (
          <Link key={option.key} href={option.href}>
            <span className="av s" style={bg(option.avatarUrl)} aria-hidden />
            <span className="grow">{option.label}</span>
          </Link>
        ))}
      </div>
    </details>
  )
}

function TopLink({ link, className }: { link: AdminShellLink; className?: string }) {
  if (link.external) {
    return (
      <a className={className} href={link.href} target="_blank" rel="noopener noreferrer">
        {link.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return (
    <Link className={className} href={link.href}>
      {link.label}
    </Link>
  )
}

/** The top bar's links: a row of quiet pills on a wide screen, a ⋯ disclosure under 1100px (CSS picks
 *  which shows; the hidden one is display:none, so it leaves the tab order and the accessibility tree). */
function TopLinks({ links }: { links: AdminShellLink[] }) {
  if (links.length === 0) return null
  return (
    <>
      <nav className="ad-links" aria-label="Go to">
        {links.map((link) => (
          <TopLink key={link.key} link={link} />
        ))}
      </nav>
      <details className="ad-more">
        <summary className="ap-ic" aria-label="More places" title="More places">
          <FqIcon name="more" />
        </summary>
        <nav className="ad-more-menu" aria-label="Go to">
          {links.map((link) => (
            <TopLink key={link.key} link={link} />
          ))}
        </nav>
      </details>
    </>
  )
}

export function AdminShell({ homeHref, crumbRoot, navLabel, space, items, search, alerts, links = [], topMenu = false, me, withinMain = false, children }: AdminShellProps) {
  const Content = withinMain ? 'div' : 'main'
  return (
    <div data-kit="members" data-energy="still">
      <div data-kit="admin">
        <div className="fq-wash" aria-hidden />
        <div className="ad">
          <aside className="ad-side" style={{ viewTransitionName: 'ad-side' }}>
            {/* The Frequency wordmark goes back to the Feed, out of the console (owner, 2026-10-20); the console's
                own home is its first row. The link wraps the wordmark because the wordmark is a CSS mask, which
                would clip a focus ring. */}
            <Link href="/feed" className="ad-logo" aria-label="Frequency, back to the Feed">
              <span className="fq-logo-flow" aria-hidden />
            </Link>
            <SpaceCard space={space} />
            <Suspense fallback={<AdminNavList items={items} label={navLabel} topMenu={topMenu} />}>
              <AdminNav items={items} label={navLabel} topMenu={topMenu} />
            </Suspense>
            <span className="ap-sp" />
            <nav className="ad-nav" aria-label="Leave the console">
              <Link href="/feed"><FqIcon name="arrow" />Back to Frequency</Link>
              <Link href="/help"><FqIcon name="tip" />Help</Link>
            </nav>
          </aside>
          <div>
            <header className="ad-top" style={{ viewTransitionName: 'ad-top' }}>
              {/* Phone only (CSS): who this console is, one tap to its home. The wordmark and the switcher are in the sidebar on a wide screen and in the More sheet on a phone. */}
              <Link href={homeHref} className="ad-top-id">
                <span className="av" style={bg(space.avatarUrl)} aria-hidden />
                <span className="grow"><b>{space.name}</b><small>{space.role}</small></span>
                <span className="sr-only">Console home</span>
              </Link>
              <Suspense fallback={<span className="crumb">{crumbRoot}</span>}>
                <AdminCrumb root={crumbRoot} items={items} />
              </Suspense>
              <span className="ap-sp" />
              <TopLinks links={links} />
              <Link href={search.href} className="ap-search ad-search" aria-label={search.label}>
                <FqIcon name="search" size={17} />
                <span>{search.label}</span>
              </Link>
              <Link className="ap-ic" href={alerts.href} title="Alerts" aria-label={alerts.unread > 0 ? `Alerts, ${alerts.unread} unread` : 'Alerts'}>
                <FqIcon name="nudge" />
                {alerts.unread > 0 && <i aria-hidden />}
              </Link>
              <Link className="ap-me" href={me.href} title={me.name} aria-label={me.name} style={bg(me.avatarUrl)} />
            </header>
            <Suspense fallback={null}>
              {topMenu ? <AdminTopMenu items={items} /> : <AdminPhoneStrip items={items} />}
            </Suspense>
            <Content className="ad-main"><ConsoleSlide>{children}</ConsoleSlide></Content>
          </div>
        </div>
        <Suspense fallback={null}>
          <AdminPhoneBar items={items} label={navLabel} space={space} links={links} />
        </Suspense>
      </div>
    </div>
  )
}
