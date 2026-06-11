'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronDown, Menu, X } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_HOME,
  ADMIN_GROUPS,
  canSeeGroup,
  domainForPath,
  groupSections,
  type DomainKey,
} from '@/app/(main)/admin/sections'

// The admin WORKSPACE sidebar (Phase 2). It replaces the old top switcher: when a
// viewer is anywhere under /admin/*, the global member rail is suppressed (page-chrome
// registers /admin as left-rail 'none') and this becomes the left column instead.
//
// Layout, top to bottom:
//   • "Back to Frequency" → /feed, then an "Admin" heading.
//   • Home (/admin) — the exec dashboard.
//   • The three domains (Programs / Operations / Growth), each a collapsible section.
//     A domain's first child is its Dashboard (/admin/{key}); the rest are its area
//     links. Operations renders its `section` buckets (Community / People / Trust &
//     safety / Site & system) as quiet group headers.
//
// Role filtering is reused verbatim from the Phase 1 helpers (canSeeGroup /
// groupSections, which call canUseLink) — gating is never reimplemented here.
//
// Expanded/collapsed state per domain is remembered per device in localStorage
// (mirrors the rail-size pref), but the domain that owns the current path always
// starts expanded.

const STORAGE_KEY = 'freq-admin-nav-expanded'

// Match the member rail's visual language (app-shell.tsx NavLinkList): rounded
// items, icon + label, muted text that warms on hover, primary-tinted active.
function itemClass(active: boolean) {
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-primary-bg font-semibold text-primary-strong'
      : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
  }`
}

interface AdminNavProps {
  role: CommunityRole
  /** STAFF axis (web_role, ADR-208) — gates admin/janitor-min destinations. */
  webRole?: WebRole
  staffRole?: StaffRole | null
}

// The shared nav body — rendered both in the desktop left column (AdminSidebar) and
// inside the mobile disclosure (AdminMobileMenu). `onNavigate` lets the mobile sheet
// close itself on a link tap.
function AdminNav({
  role,
  webRole = 'none',
  staffRole = null,
  onNavigate,
}: AdminNavProps & { onNavigate?: () => void }) {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)

  // The domains this viewer may enter, with their role-visible link buckets.
  const groups = ADMIN_GROUPS.filter((g) => canSeeGroup(g, role, webRole, staffRole)).map(
    (g) => ({
      key: g.key,
      label: g.label,
      Icon: g.Icon,
      href: g.href,
      sections: groupSections(g.key, role, webRole, staffRole),
    }),
  )

  // Per-device collapse state, hydrated after mount (server + first client render
  // share the defaults, so no hydration mismatch). The active domain is always
  // forced open regardless of the stored value.
  const [stored, setStored] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setStored(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      // Corrupt/blocked storage — fall back to defaults (active domain expanded).
    }
  }, [])

  function isExpanded(key: DomainKey): boolean {
    if (activeDomain?.key === key) return true
    // Default: collapsed unless the viewer expanded it before.
    return stored[key] ?? false
  }

  function toggle(key: DomainKey) {
    setStored((prev) => {
      const next = { ...prev, [key]: !isExpanded(key) }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore storage write failures (private mode, quota).
      }
      return next
    })
  }

  const HomeIcon = ADMIN_HOME.Icon

  return (
    <nav aria-label="Admin" className="flex flex-col gap-3 px-3 py-3">
      {/* Back to the member app + the workspace heading. */}
      <div className="space-y-2 pb-1">
        <Link
          href="/feed"
          className="flex items-center gap-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          Back to Frequency
        </Link>
        <p className="px-3 text-sm font-bold text-text">Admin</p>
      </div>

      {/* Home — the exec dashboard, pinned above the domains. */}
      <div className="space-y-0.5 border-b border-border pb-2">
        <Link href={ADMIN_HOME.href} onClick={onNavigate} className={itemClass(pathname === '/admin')}>
          <HomeIcon
            className={`h-[18px] w-[18px] shrink-0 ${
              pathname === '/admin' ? 'text-primary-strong' : 'text-subtle'
            }`}
            strokeWidth={pathname === '/admin' ? 2.5 : 2}
          />
          {ADMIN_HOME.label}
        </Link>
      </div>

      {/* The three operator domains. */}
      <div className="space-y-1">
        {groups.map((group) => {
          const expanded = isExpanded(group.key)
          const domainActive = activeDomain?.key === group.key
          const DomainIcon = group.Icon
          return (
            <div key={group.key} className="space-y-0.5">
              {/* Collapsible domain header. */}
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  domainActive
                    ? 'text-text'
                    : 'text-muted hover:bg-surface-elevated hover:text-text'
                }`}
              >
                <DomainIcon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    domainActive ? 'text-primary-strong' : 'text-subtle'
                  }`}
                  strokeWidth={domainActive ? 2.5 : 2}
                />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-subtle transition-transform duration-200 ${
                    expanded ? '' : '-rotate-90'
                  }`}
                  aria-hidden
                />
              </button>

              {/* Domain children: the dashboard + area links, grouped by section. */}
              {expanded && (
                <div className="space-y-0.5 pl-3">
                  {/* The domain dashboard is always the first child. */}
                  <Link href={group.href} onClick={onNavigate} className={itemClass(pathname === group.href)}>
                    <DomainIcon
                      className={`h-[18px] w-[18px] shrink-0 ${
                        pathname === group.href ? 'text-primary-strong' : 'text-subtle'
                      }`}
                      strokeWidth={pathname === group.href ? 2.5 : 2}
                    />
                    Dashboard
                  </Link>

                  {group.sections.map((section, i) => (
                    <div key={section.section || `flat-${i}`} className="space-y-0.5">
                      {section.section && (
                        <p className="px-3 pb-0.5 pt-2 text-3xs font-semibold uppercase tracking-wider text-subtle">
                          {section.section}
                        </p>
                      )}
                      {section.links.map((link) => {
                        const LinkIcon = link.Icon
                        const active =
                          link.href === pathname || pathname.startsWith(`${link.href}/`)
                        return (
                          <Link key={link.href} href={link.href} onClick={onNavigate} className={itemClass(active)}>
                            <LinkIcon
                              className={`h-[18px] w-[18px] shrink-0 ${
                                active ? 'text-primary-strong' : 'text-subtle'
                              }`}
                              strokeWidth={active ? 2.5 : 2}
                            />
                            {link.label}
                          </Link>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

// Desktop left column. Mounted by app/(main)/admin/layout.tsx in place of the global
// member rail (which page-chrome suppresses on /admin/*). Sticky under the header,
// scrolls internally, hidden below md (mobile uses the disclosure below).
export function AdminSidebar(props: AdminNavProps) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-sm">
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] self-start overflow-y-auto">
        <AdminNav {...props} />
      </div>
    </aside>
  )
}

// Mobile disclosure. Below md the desktop column is hidden and the content is
// full-width; this "Admin menu" button expands the same domain list in a sheet.
// Tapping a link or the backdrop closes it. Keeps the phone screen uncluttered and
// never forces horizontal overflow.
export function AdminMobileMenu(props: AdminNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const here = activeDomain?.label ?? 'Home'

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        <Menu className="h-4 w-4 shrink-0 text-subtle" />
        <span className="flex-1 text-left">Admin menu</span>
        <span className="text-xs text-subtle">{here}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside
            role="dialog"
            aria-label="Admin"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-end border-b border-border px-2 py-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AdminNav {...props} onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
