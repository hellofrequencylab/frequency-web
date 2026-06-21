'use client'

import { MegaBar, type MegaEntry } from '@/components/layout/mega-menu'
import type { AdminNavSection } from '@/lib/admin/nav'

// The admin top navigation as a best-practice mega bar: each operator SECTION is a trigger
// that navigates to its root on click AND reveals its sub-pages as a FULL-WIDTH row sliding
// down under the bar (hover / keyboard focus). Sections with no sub-pages (Dashboard,
// Leadership) render as plain tabs. Gated server-side and passed in.
//
// The `relative` wrapper is the panel's positioning anchor, so the full-width row spans the
// content column (not the whole viewport) and sits flush under the bar.

export function AdminMegaNav({ sections }: { sections: AdminNavSection[] }) {
  if (sections.length === 0) return null

  const entries: MegaEntry[] = sections.map((s) => ({
    label: s.label,
    href: s.href,
    sections: s.groups ?? [],
  }))

  return (
    <div className="relative">
      <MegaBar entries={entries} variant="light" ariaLabel="Admin" />
    </div>
  )
}
