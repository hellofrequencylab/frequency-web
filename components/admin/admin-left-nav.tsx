'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartLine } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_GROUPS,
  canSeeGroup,
  canUseLink,
  domainForPath,
  groupLinks,
  groupSections,
  type AdminLink,
} from '@/app/(main)/admin/sections'

// The admin LEFT navigation column — the PRIMARY admin nav (ADR-228 addendum 2;
// the top bar is just the domain switcher). Two modes:
//
//   • Inside a domain: that domain's areas under their section headers.
//   • On Home: a sitemap — each domain with its key areas beneath it, plus a
//     SITE ANALYTICS group (the insight surfaces collected from across the
//     domains, so the read-the-numbers path is one click from Home).
//
// Role filtering is reused verbatim from sections.ts (canSeeGroup / groupSections
// / canUseLink) — gating is never reimplemented here.

interface AdminLeftNavProps {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

// The Home sitemap shows each domain's first KEY_AREAS links (the full list lives
// one click away on the domain dashboard + its in-domain rail).
const KEY_AREAS = 5

// Site Analytics — the insight surfaces, COLLECTED from the existing domain links
// (curated hrefs, never re-declared; each still passes its own canUseLink gate).
const ANALYTICS_HREFS = [
  '/admin/engagement',
  '/admin/intel',
  '/admin/outcomes',
  '/admin/segments',
  '/admin/expansion',
  '/admin/insights',
] as const

function analyticsLinks(
  role: CommunityRole,
  webRole: WebRole,
  staffRole: StaffRole | null,
): AdminLink[] {
  const all = ADMIN_GROUPS.flatMap((g) => g.links)
  return ANALYTICS_HREFS.map((href) => all.find((l) => l.href === href))
    .filter((l): l is AdminLink => !!l)
    .filter((l) => canUseLink(l, role, webRole, staffRole))
}

function itemClass(active: boolean) {
  return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-primary-bg font-semibold text-primary-strong'
      : 'font-medium text-muted hover:bg-surface-elevated hover:text-text'
  }`
}

function NavLink({ link, pathname }: { link: AdminLink; pathname: string }) {
  const active = link.href === pathname || pathname.startsWith(`${link.href}/`)
  return (
    <Link href={link.href} title={link.desc} className={itemClass(active)}>
      <link.Icon
        className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
        aria-hidden
      />
      <span className="truncate">{link.label}</span>
    </Link>
  )
}

export function AdminLeftNav({ role, webRole = 'none', staffRole = null }: AdminLeftNavProps) {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)

  // ── In a domain: its areas under their section headers. ─────────────────────
  if (activeDomain) {
    return (
      <nav aria-label="Admin section" className="space-y-4">
        <Link href={activeDomain.href} className={itemClass(pathname === activeDomain.href)}>
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
              <p className="px-3 pb-1 pt-1 text-3xs font-semibold uppercase tracking-wider text-subtle">
                {section.section}
              </p>
            )}
            {section.links.map((link) => (
              <NavLink key={link.href} link={link} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>
    )
  }

  // ── On Home: the sitemap — domains with their key areas + Site Analytics. ───
  const groups = ADMIN_GROUPS.filter((g) => canSeeGroup(g, role, webRole, staffRole))
  const analytics = analyticsLinks(role, webRole, staffRole)

  return (
    <nav aria-label="Admin" className="space-y-6">
      {groups.map((g) => {
        const links = groupLinks(g.key, role, webRole, staffRole).slice(0, KEY_AREAS)
        return (
          <div key={g.key} className="space-y-0.5">
            <Link
              href={g.href}
              title={g.blurb}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
            >
              <g.Icon className="h-[18px] w-[18px] shrink-0 text-primary-strong" aria-hidden />
              {g.label}
            </Link>
            {links.map((link) => (
              <NavLink key={link.href} link={link} pathname={pathname} />
            ))}
            <Link
              href={g.href}
              className="block rounded-lg px-3 py-1.5 pl-[2.625rem] text-xs font-semibold text-primary-strong transition-colors hover:underline"
            >
              All areas →
            </Link>
          </div>
        )
      })}

      {analytics.length > 0 && (
        <div className="space-y-0.5 border-t border-border pt-4">
          <p className="flex items-center gap-2 px-3 pb-1 text-3xs font-semibold uppercase tracking-wider text-subtle">
            <ChartLine className="h-3.5 w-3.5" aria-hidden />
            Site Analytics
          </p>
          {analytics.map((link) => (
            <NavLink key={link.href} link={link} pathname={pathname} />
          ))}
        </div>
      )}
    </nav>
  )
}
