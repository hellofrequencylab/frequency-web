'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import {
  ADMIN_HOME,
  ADMIN_GROUPS,
  canSeeGroup,
  domainForPath,
  groupSections,
  type AdminLink,
  type DomainKey,
} from '@/app/(main)/admin/sections'

// The admin WORKSPACE menubar (Phase 4, ADR-228). One sticky top bar is the entire
// admin nav — no persistent sidebar, no breadcrumb strip.
//
//   Home   Programs ▾   Operations ▾   Growth ▾
//   ─────────────────────────────────────────────  ← clicking a domain pops open a
//   Overview · …      COMMUNITY   PEOPLE   …          SECOND ROW under the bar: the
//                                                     domain's areas as columns.
//
// MEGA-MENU, second-row style: a domain click expands a full-width row beneath the
// bar (click again / Esc / outside / navigate closes it) rather than a floating
// panel — the columns read like a settings band, not a dropdown. Operations keeps
// its titled section columns (Community / People / Trust & safety / Site & system);
// a flat domain splits into balanced columns. Role filtering is reused verbatim
// from sections.ts (canSeeGroup / groupSections → canUseLink) — gating is never
// reimplemented here. The active domain (domainForPath) is highlighted, which is
// the wayfinding the old breadcrumb provided.

interface AdminNavProps {
  role: CommunityRole
  /** STAFF axis (web_role, ADR-208) — gates admin/janitor-min destinations. */
  webRole?: WebRole
  staffRole?: StaffRole | null
}

/** The domains this viewer may enter, each with its role-visible link sections. */
function useVisibleGroups({ role, webRole = 'none', staffRole = null }: AdminNavProps) {
  return ADMIN_GROUPS.filter((g) => canSeeGroup(g, role, webRole, staffRole)).map((g) => ({
    group: g,
    sections: groupSections(g.key, role, webRole, staffRole),
  }))
}

function linkActive(pathname: string, href: string) {
  return href === pathname || pathname.startsWith(`${href}/`)
}

/** Split a flat link list into balanced mega-menu columns of at most `size`
 *  (a domain with no `section` buckets still reads as columns, not a strip). */
function chunkLinks(links: AdminLink[], size: number): AdminLink[][] {
  if (links.length === 0) return []
  const cols = Math.ceil(links.length / size)
  const per = Math.ceil(links.length / cols)
  return Array.from({ length: cols }, (_, i) => links.slice(i * per, (i + 1) * per))
}

// ── Mobile: a single "Admin menu" sheet ──────────────────────────────────────
function MobileMenu(props: AdminNavProps) {
  const groups = useVisibleGroups(props)
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

/** The admin workspace top-nav. Sticky under the global header; full-bleed to the
 *  shell's content padding. Desktop = a menubar whose domain items expand a
 *  SECOND ROW of column links beneath the bar; mobile = an "Admin menu" sheet. */
export function AdminTopNav(props: AdminNavProps) {
  const pathname = usePathname()
  const activeDomain = domainForPath(pathname)
  const groups = useVisibleGroups(props)
  const HomeIcon = ADMIN_HOME.Icon

  // Which domain's second row is open (desktop). Click toggles; Esc / a click
  // outside the bar / navigating closes.
  const [openKey, setOpenKey] = useState<DomainKey | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openKey) return
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenKey(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenKey(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [openKey])

  // Navigating anywhere closes the row — derived during render (the React
  // "adjust state when props change" pattern; no effect, no extra paint).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (openKey) setOpenKey(null)
  }

  const openGroup = groups.find((g) => g.group.key === openKey) ?? null

  return (
    <div
      ref={barRef}
      className="sticky top-14 z-30 -mx-6 -mt-6 mb-6 border-b border-border bg-surface/95 px-6 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10"
    >
      {/* Row 1 — the menubar. */}
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

        {groups.map(({ group }) => {
          const DomainIcon = group.Icon
          const isOpen = openKey === group.key
          const isActive = activeDomain?.key === group.key
          return (
            <button
              key={group.key}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`admin-megarow-${group.key}`}
              onClick={() => setOpenKey(isOpen ? null : group.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                isActive || isOpen
                  ? 'bg-surface-elevated text-text'
                  : 'text-muted hover:bg-surface-elevated hover:text-text'
              }`}
            >
              <DomainIcon
                className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-strong' : 'text-subtle'}`}
                aria-hidden
              />
              {group.label}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          )
        })}
      </nav>

      {/* Row 2 — the mega row: the open domain's areas as columns. */}
      {openGroup && (
        <div
          id={`admin-megarow-${openGroup.group.key}`}
          className="hidden border-t border-border py-4 md:block"
        >
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {/* Lead column: the domain dashboard + its one-line framing. */}
            <div className="w-64 min-w-0">
              <Link
                href={openGroup.group.href}
                onClick={() => setOpenKey(null)}
                className={`block rounded-xl px-3 py-2 ${
                  pathname === openGroup.group.href ? 'bg-primary-bg' : 'hover:bg-surface-elevated'
                }`}
              >
                <span
                  className={`block text-sm font-bold ${
                    pathname === openGroup.group.href ? 'text-primary-strong' : 'text-text'
                  }`}
                >
                  {openGroup.group.label} dashboard
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {openGroup.group.blurb}
                </span>
              </Link>
            </div>

            {/* Section columns: Operations gets its titled buckets; a flat domain is
                split into balanced columns of ~6. */}
            {(openGroup.sections.length > 1
              ? openGroup.sections
              : chunkLinks(openGroup.sections[0]?.links ?? [], 6).map((links) => ({
                  section: '',
                  links,
                }))
            ).map((section, i) => (
              <div key={section.section || `col-${i}`} className="w-52 min-w-0">
                {section.section && (
                  <p className="px-3 pb-1.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
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
                      title={link.desc}
                      onClick={() => setOpenKey(null)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${
                        isActive
                          ? 'bg-primary-bg font-semibold text-primary-strong'
                          : 'font-medium text-text hover:bg-surface-elevated'
                      }`}
                    >
                      <LinkIcon
                        className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-strong' : 'text-subtle'}`}
                        aria-hidden
                      />
                      <span className="truncate">{link.label}</span>
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile disclosure. */}
      <div className="py-2.5 md:hidden">
        <MobileMenu {...props} />
      </div>
    </div>
  )
}
