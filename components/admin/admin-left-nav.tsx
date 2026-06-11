'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_GROUPS,
  canSeeGroup,
  domainForPath,
  groupSections,
} from '@/app/(main)/admin/sections'

// The admin LEFT navigation column (ADR-228 addendum: "Navigation left, info
// right"). NOT the old all-domains accordion sidebar — this rail is SCOPED to the
// active domain: enter Operations and the rail shows Operations' areas under their
// section headers; the top-nav megamenu stays the cross-domain switcher. On Home
// (no active domain) it lists the three domain dashboards as the jump-off.
//
// Role filtering is reused verbatim from sections.ts (canSeeGroup / groupSections
// → canUseLink) — gating is never reimplemented here.

interface AdminLeftNavProps {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

function itemClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-primary-bg font-semibold text-primary-strong'
      : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
  }`
}

export function AdminLeftNav({ role, webRole = 'none', staffRole = null }: AdminLeftNavProps) {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const groups = ADMIN_GROUPS.filter((g) => canSeeGroup(g, role, webRole, staffRole))

  return (
    <nav aria-label="Admin section" className="space-y-3">
      {activeDomain ? (
        <>
          {/* The active domain's dashboard heads its rail. */}
          <Link
            href={activeDomain.href}
            className={itemClass(pathname === activeDomain.href)}
          >
            <activeDomain.Icon
              className={`h-[18px] w-[18px] shrink-0 ${
                pathname === activeDomain.href ? 'text-primary-strong' : 'text-subtle'
              }`}
              aria-hidden
            />
            {activeDomain.label}
          </Link>

          {groupSections(activeDomain.key, role, webRole, staffRole).map((section, i) => (
            <div key={section.section || `flat-${i}`} className="space-y-0.5">
              {section.section && (
                <p className="px-3 pb-0.5 pt-1.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
                  {section.section}
                </p>
              )}
              {section.links.map((link) => {
                const active = link.href === pathname || pathname.startsWith(`${link.href}/`)
                return (
                  <Link key={link.href} href={link.href} title={link.desc} className={itemClass(active)}>
                    <link.Icon
                      className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
                      aria-hidden
                    />
                    <span className="truncate">{link.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="px-3 pb-0.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
            Domains
          </p>
          {groups.map((g) => (
            <Link key={g.key} href={g.href} title={g.blurb} className={itemClass(false)}>
              <g.Icon className="h-[18px] w-[18px] shrink-0 text-subtle" aria-hidden />
              {g.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  )
}
