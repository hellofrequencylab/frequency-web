import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { AdminCrumb, AdminNav, AdminNavList } from './admin-nav'
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
  /** Where the logo goes (the console's home). */
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
  me: { name: string; avatarUrl: string | null; href: string }
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
      <summary className="ad-space" aria-label={`${space.name}, switch console`}>
        {body}
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

export function AdminShell({ homeHref, crumbRoot, navLabel, space, items, search, alerts, links = [], me, children }: AdminShellProps) {
  return (
    <div data-kit="members" data-energy="still">
      <div data-kit="admin">
        <div className="fq-wash" aria-hidden />
        <div className="ad">
          <aside className="ad-side">
            {/* The link wraps the wordmark because the wordmark is a CSS mask, which would clip a focus ring. */}
            <Link href={homeHref} className="ad-logo" aria-label="Frequency admin, console home">
              <span className="fq-logo-flow" aria-hidden />
            </Link>
            <SpaceCard space={space} />
            <Suspense fallback={<AdminNavList items={items} label={navLabel} />}>
              <AdminNav items={items} label={navLabel} />
            </Suspense>
            <span className="ap-sp" />
            <nav className="ad-nav" aria-label="Leave the console">
              <Link href="/feed"><FqIcon name="arrow" />Back to Frequency</Link>
              <Link href="/help"><FqIcon name="tip" />Help</Link>
            </nav>
          </aside>
          <div>
            <header className="ad-top">
              <Suspense fallback={<span className="crumb">{crumbRoot}</span>}>
                <AdminCrumb root={crumbRoot} items={items} />
              </Suspense>
              <span className="ap-sp" />
              <TopLinks links={links} />
              <Link href={search.href} className="ap-search" style={{ flex: '0 1 260px' }}>
                <FqIcon name="search" size={17} />
                <span>{search.label}</span>
              </Link>
              <Link className="ap-ic" href={alerts.href} title="Alerts" aria-label={alerts.unread > 0 ? `Alerts, ${alerts.unread} unread` : 'Alerts'}>
                <FqIcon name="nudge" />
                {alerts.unread > 0 && <i aria-hidden />}
              </Link>
              <Link className="ap-me" href={me.href} title={me.name} aria-label={me.name} style={bg(me.avatarUrl)} />
            </header>
            <main className="ad-main">{children}</main>
          </div>
        </div>
      </div>
    </div>
  )
}
