'use client'

import { LayoutGrid, Search, Eye, type LucideIcon } from 'lucide-react'
import { PAGE_SETTING_SECTIONS, type PageSettingSection } from '@/lib/page-settings/sections'
import { LayoutEditor } from './layout-editor'
import { SeoEditor } from './seo-editor'
import { StatusEditor } from './status-editor'

// The staff-only "Page" group inside the on-page Settings panel (PageAdminBar). It tunes THE
// INTERIOR of the page (not the app-shell chrome) and renders the page-settings spine
// (lib/page-settings/sections.ts): a LIVE section shows its real control under a header; a
// staged one renders an honest, non-interactive "Next" row. SEO is live (ADR-268); Layout +
// Status stage until their engines land.

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
      <div className="space-y-4">
        {PAGE_SETTING_SECTIONS.map((section) => {
          const Icon = SECTION_ICON[section.id]

          if (section.status === 'live') {
            return (
              <div key={section.id}>
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  <span className="text-sm font-semibold text-text">{section.label}</span>
                </div>
                <p className="mb-2 text-xs text-muted">{section.hint}</p>
                {section.id === 'layout' && <LayoutEditor />}
                {section.id === 'seo' && <SeoEditor />}
                {section.id === 'status' && <StatusEditor />}
              </div>
            )
          }

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
