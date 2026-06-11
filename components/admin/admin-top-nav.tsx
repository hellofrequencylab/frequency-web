'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_HOME,
  ADMIN_GROUPS,
  canSeeGroup,
  domainForPath,
  groupSections,
} from '@/app/(main)/admin/sections'

// The admin top bar (ADR-228 addendum 2): PLAIN domain links — no dropdowns, no
// mega-row. The LEFT navigation column (admin-left-nav.tsx) is the primary nav;
// this bar is just the domain switcher + wayfinding (active domain highlighted).
//
//   Home   Programs   Operations   Growth
//
// Role filtering is reused verbatim from sections.ts (canSeeGroup) — gating is
// never reimplemented here. Mobile keeps the "Admin menu" sheet (the left rail is
// hidden below lg, so the sheet carries the full nav on phones).

interface AdminNavProps {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

function linkActive(pathname: string, href: string) {
  return href === pathname || pathname.startsWith(`${href}/`)
}

// ── Mobile: a single "Admin menu" sheet ──────────────────────────────────────
function MobileMenu({ role, webRole = 'none', staffRole = null }: AdminNavProps) {
  const groups = ADMIN_GROUPS.filter((g) => canSeeGroup(g, role, webRole, staffRole)).map((g) => ({
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
        <span className="text-xs text-subtle">{activeDomain?.label ?? 'Home'}</span>
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
                Home
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

/** The admin top bar: plain domain links, active domain highlighted. The left
 *  rail is the deep nav; this just switches domains. */
export function AdminTopNav(props: AdminNavProps) {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const groups = ADMIN_GROUPS.filter((g) =>
    canSeeGroup(g, props.role, props.webRole ?? 'none', props.staffRole ?? null),
  )
  const HomeIcon = ADMIN_HOME.Icon

  return (
    <div className="sticky top-14 z-30 -mx-6 -mt-6 mb-8 border-b border-border bg-surface/95 px-6 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
      <div className="mx-auto w-full max-w-[105rem]">
        {/* Desktop: plain links. */}
        <nav aria-label="Admin" className="hidden h-12 items-center gap-1 md:flex">
          <Link
            href={ADMIN_HOME.href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              pathname === '/admin'
                ? 'bg-surface-elevated text-text'
                : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            <HomeIcon
              className={`h-4 w-4 shrink-0 ${pathname === '/admin' ? 'text-primary-strong' : 'text-subtle'}`}
              aria-hidden
            />
            Home
          </Link>
          {groups.map((group) => {
            const DomainIcon = group.Icon
            const isActive = activeDomain?.key === group.key
            return (
              <Link
                key={group.key}
                href={group.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-surface-elevated text-text'
                    : 'text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                <DomainIcon
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-strong' : 'text-subtle'}`}
                  aria-hidden
                />
                {group.label}
              </Link>
            )
          })}
        </nav>

        {/* Mobile disclosure. */}
        <div className="py-2.5 md:hidden">
          <MobileMenu {...props} />
        </div>
      </div>
    </div>
  )
}
