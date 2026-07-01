'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ResolvedCategory } from '@/lib/menus/types'
import { canSeeMenuItem, type MenuViewer } from '@/components/layout/menu-role'

// The admin sub-nav (§6 + §6a of docs/NAV-SYSTEM-REDESIGN.md). The five Studio worlds live in
// the LEFT rail; this is the FLAT top row that replaced the old MegaBar's second dropdown layer.
// For the ACTIVE world (resolved from the pathname), its sub-pages render as PLAIN TEXT LINKS
// left-to-right on ONE line — no dropdown, no panel, single layer. The active leaf is emphasized
// (weight + underline); overflow scrolls horizontally with a subtle fade edge (.admin-subnav-scroll).
//
// Client component: usePathname() keeps the active section + active leaf reactive across client
// navigations (reading the URL in a Server Component is unsupported, and layout state persists, so
// a server-computed active state would go stale). Gating unions the two axes via canSeeMenuItem —
// the exact resolver every other menu surface uses — so a link only shows when the viewer can reach
// it. Every leaf keeps its own minAccess + staffDomain + staffLevel; we move where it renders, never
// what it permits. Pages still re-gate server-side (requireAdmin).

interface Props {
  /** The admin_header menu's top-level categories (the Studio worlds/sections). */
  sections: ResolvedCategory[]
  viewer: MenuViewer
}

// All hrefs under a section subtree (items + nested children), for longest-prefix active matching.
function hrefsOf(cat: ResolvedCategory): string[] {
  const out: string[] = []
  for (const it of cat.items) if (it.href) out.push(it.href)
  for (const ch of cat.children) out.push(...hrefsOf(ch))
  return out
}

// The section whose subtree has the LONGEST href prefixing the pathname (so /admin/crm/today
// resolves to the CRM world). Mirrors adminSectionForPath in app-shell.tsx.
function activeSectionFor(sections: ResolvedCategory[], pathname: string): ResolvedCategory | null {
  let best: { cat: ResolvedCategory; len: number } | null = null
  for (const section of sections) {
    for (const href of hrefsOf(section)) {
      const match = pathname === href || pathname.startsWith(`${href}/`)
      if (match && href.length > (best?.len ?? 0)) best = { cat: section, len: href.length }
    }
  }
  return best?.cat ?? null
}

export function AdminSubNav({ sections, viewer }: Props) {
  const pathname = usePathname()

  // The active world's gate-filtered leaves, flattened to one row (the section's items plus its
  // one level of children's items — admin_header nests one deep). No dropdown: everything is a link.
  const links = useMemo(() => {
    const section = activeSectionFor(sections, pathname)
    if (!section) return []
    const leaves = [
      ...section.items,
      ...section.children.flatMap((ch) => ch.items),
    ]
    return leaves.filter((it) => it.href && canSeeMenuItem(it, viewer))
  }, [sections, pathname, viewer])

  // Nothing reachable in the active world (or off a matching route): render NOTHING — no empty
  // divider strip. The wrapper (its own hairline + padding) belongs here so it disappears whole.
  if (links.length === 0) return null

  return (
    <div className="border-b border-border/60 py-1.5">
      <nav
        aria-label="Admin section"
        className="admin-subnav-scroll -mx-1 flex items-center gap-1 overflow-x-auto whitespace-nowrap px-1"
      >
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`)
          return (
            <Link
              key={l.id}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-md px-2.5 py-1 text-sm transition-colors ${
                active
                  ? 'font-semibold text-text underline decoration-primary decoration-2 underline-offset-8'
                  : 'text-muted hover:text-text hover:bg-surface-elevated'
              }`}
            >
              {l.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
