'use client'

import { LayoutGrid, Search, Eye, type LucideIcon } from 'lucide-react'
import { PAGE_SETTING_SECTIONS, type PageSettingSection } from '@/lib/page-settings/sections'

// The staff-only "Page" group inside the on-page Settings panel (PageAdminBar). Where
// the entity modules tune a circle/event, this tunes THE INTERIOR of the page itself —
// what shows inside the page container and how it reads (docs/EMBEDDED-ADMIN.md inline
// layer). It deliberately does NOT touch the app shell chrome (the global rails): the
// shell rail is platform chrome managed once in /admin/page-layout, never per page here.
//
// It renders the interior spine (lib/page-settings/sections.ts) so staff see the whole
// intended shape; each section is staged as an honest, non-interactive "Next" row until
// its interior engine lands (Layout = the WidgetSlot engine; SEO + Status = a per-route
// store). Nothing here pretends a staged control works.

const SECTION_ICON: Record<PageSettingSection['id'], LucideIcon> = {
  layout: LayoutGrid,
  seo: Search,
  status: Eye,
}

export function PageSettingsModule() {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Page</p>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Tune what shows inside this page. The app shell (the global rails and header) stays put.
      </p>
      <div className="space-y-3">
        {PAGE_SETTING_SECTIONS.map((section) => {
          const Icon = SECTION_ICON[section.id]
          return (
            <div
              key={section.id}
              className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-surface/60 p-4"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">{section.label}</span>
                  <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle">
                    Next
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{section.hint}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
