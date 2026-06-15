'use client'

import { PanelRight, Search, Eye, LayoutGrid, type LucideIcon } from 'lucide-react'
import { railFor, type Rail } from '@/lib/layout/page-chrome'
import { RouteChromeRow } from '@/components/admin/page-layout/route-chrome-row'
import { PAGE_SETTING_SECTIONS, type PageSettingSection } from '@/lib/page-settings/sections'

// The staff-only "Page" group inside the on-page Settings panel (PageAdminBar). Where
// the entity modules tune a circle/event, this tunes THE PAGE ITSELF — surfacing the
// page-level settings that used to live only in the back end (/admin/page-layout) onto
// the page, for admin+ (gated upstream by canManagePageSettings; every write re-checks).
//
// It renders the full spine (lib/page-settings/sections.ts) so the panel shows the whole
// intended shape: Chrome is wired LIVE (it reuses the live RouteChromeRow + page-chrome
// override store); SEO / Status / Layout render as honest, non-interactive "Next" rows
// until their shift lands. Nothing here pretends a staged control works.

const SECTION_ICON: Record<PageSettingSection['id'], LucideIcon> = {
  chrome: PanelRight,
  seo: Search,
  status: Eye,
  layout: LayoutGrid,
}

export function PageSettingsModule({
  pathname,
  chromeOverride,
}: {
  /** The route this panel is framing (the live page). */
  pathname: string
  /** The saved chrome override for this route, or null to follow the code default. */
  chromeOverride: Rail | null
}) {
  return (
    <div className="min-w-0">
      <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page</p>
      <div className="space-y-3">
        {PAGE_SETTING_SECTIONS.map((section) => {
          if (section.id === 'chrome') {
            // LIVE — reuses the same control + backend as /admin/page-layout, scoped to
            // this exact route. Saving takes effect on the next request (the shell merges
            // the override over the code chrome map).
            return (
              <RouteChromeRow
                key={section.id}
                route={pathname}
                label={section.label}
                codeRail={railFor(pathname)}
                initialOverride={chromeOverride}
              />
            )
          }
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
