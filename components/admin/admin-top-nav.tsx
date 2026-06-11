'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_HOME,
  visibleGroups,
  canSeeGroup,
  domainForPath,
  groupLinks,
  groupSections,
} from '@/app/(main)/admin/sections'

// The admin TOP bar (five-area IA): the open, background-less menu that holds the
// anchor "Admin Dashboard" tab on the left (under the logo, styled to signal admin
// mode) and the active area's SUB-NAV on the right. The primary areas live in the
// LEFT rail (admin-left-nav.tsx); selecting one there surfaces its tools here. Role
// filtering is reused verbatim from sections.ts. Mobile collapses to one sheet.

interface AdminNavProps {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

function linkActive(pathname: string, href: string) {
  return href === pathname || pathname.startsWith(`${href}/`)
}

// The anchor tab — the Home link, styled as a solid primary pill so admin mode reads
// at a glance. Rides under the logo (the top bar's left segment).
function DashboardTab({ pathname }: { pathname: string }) {
  const HomeIcon = ADMIN_HOME.Icon
  const onHome = pathname === '/admin'
  return (
    <Link
      href={ADMIN_HOME.href}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
        onHome
          ? 'bg-primary text-on-primary shadow-sm'
          : 'bg-primary/10 text-primary-strong ring-1 ring-inset ring-primary/25 hover:bg-primary/15'
      }`}
    >
      <HomeIcon className="h-4 w-4 shrink-0" aria-hidden />
      {ADMIN_HOME.label}
    </Link>
  )
}

// ── Mobile: a single "Admin menu" sheet (the left rail + sub-nav are hidden on
//    phones, so the sheet carries the full nav). ────────────────────────────────
function MobileMenu({ role, webRole = 'none', staffRole = null }: AdminNavProps) {
  const groups = visibleGroups(role, webRole, staffRole).map((g) => ({
    group: g,
    sections: groupSections(g.key, role, webRole, staffRole),
  }))
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const [open, setOpen] = useState(false)
  const HomeIcon = ADMIN_HOME.Icon

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        <Menu className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <span className="flex-1 text-left">Admin menu</span>
        <span className="text-xs text-subtle">{activeDomain?.label ?? ADMIN_HOME.label}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div aria-hidden onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside
            role="dialog"
            aria-label="Admin"
            className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-bold text-text">Admin</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
              <Link
                href={ADMIN_HOME.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                  pathname === '/admin'
                    ? 'bg-primary-bg font-semibold text-primary-strong'
                    : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                <HomeIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {ADMIN_HOME.label}
              </Link>

              {groups.map(({ group, sections }) => {
                const DomainIcon = group.Icon
                return (
                  <div key={group.key} className="space-y-0.5">
                    <Link
                      href={group.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 pb-1 pt-1 text-sm font-semibold text-text"
                    >
                      <DomainIcon className="h-[18px] w-[18px] shrink-0 text-primary-strong" aria-hidden />
                      {group.label}
                    </Link>
                    {sections.map((section, i) => (
                      <div key={section.section || `flat-${i}`} className="space-y-0.5">
                        {section.section && (
                          <p className="px-3 pb-0.5 pt-1.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
                            {section.section}
                          </p>
                        )}
                        {section.links.map((link) => {
                          const LinkIcon = link.Icon
                          const isActive = linkActive(pathname, link.href)
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setOpen(false)}
                              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 pl-6 text-sm ${
                                isActive
                                  ? 'bg-primary-bg font-semibold text-primary-strong'
                                  : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
                              }`}
                            >
                              <LinkIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                              {link.label}
                            </Link>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

/** The admin top bar: the Admin Dashboard anchor tab + the active area's sub-nav.
 *  Background-less (the open workspace look); the left rail is the primary nav. */
export function AdminTopNav(props: AdminNavProps) {
  const pathname = usePathname()
  const active = domainForPath(pathname)
  const subLinks = active
    ? groupLinks(active.key, props.role, props.webRole ?? 'none', props.staffRole ?? null)
    : []
  // Active only when the domain is actually visible to the viewer (defensive).
  const showSub =
    !!active && canSeeGroup(active, props.role, props.webRole ?? 'none', props.staffRole ?? null)

  return (
    <div className="sticky top-14 z-30 mb-8 bg-surface">
      <div className="mx-auto flex w-full max-w-[105rem] gap-8">
        {/* Left segment — the anchor tab, aligned under the logo with the rail. */}
        <div className="hidden w-48 shrink-0 items-center py-2.5 lg:flex">
          <DashboardTab pathname={pathname} />
        </div>

        {/* Content column — the active area's sub-nav (horizontal, scrolls if long). */}
        <div className="min-w-0 flex-1">
          <nav
            aria-label={active ? `${active.label} sections` : 'Admin'}
            className="hidden h-14 items-center gap-1 overflow-x-auto md:flex"
          >
            {showSub && subLinks.length > 0 ? (
              subLinks.map((link) => {
                const isActive = linkActive(pathname, link.href)
                const LinkIcon = link.Icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    title={link.desc}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-surface-elevated text-text'
                        : 'text-muted hover:bg-surface-elevated hover:text-text'
                    }`}
                  >
                    <LinkIcon
                      className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-strong' : 'text-subtle'}`}
                      aria-hidden
                    />
                    {link.label}
                  </Link>
                )
              })
            ) : (
              <span className="text-sm text-subtle">Pick an area on the left to see its tools.</span>
            )}
          </nav>

          {/* Mobile disclosure — Admin Dashboard tab + the full-nav sheet. */}
          <div className="flex items-center gap-2 py-2.5 md:hidden">
            <DashboardTab pathname={pathname} />
            <div className="min-w-0 flex-1">
              <MobileMenu {...props} />
            </div>
          </div>
        </div>

        <div className="hidden w-64 shrink-0 xl:block" aria-hidden />
      </div>
    </div>
  )
}
