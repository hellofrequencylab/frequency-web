'use client'

import { usePathname } from 'next/navigation'
import { LayoutGrid, Search, Eye, type LucideIcon } from 'lucide-react'
import { PAGE_SETTING_SECTIONS, type PageSettingSection } from '@/lib/page-settings/sections'
import { isModuleRoute } from '@/lib/widgets/module-routes'
import { LayoutEditor } from './layout-editor'
import { SeoEditor } from './seo-editor'
import { StatusEditor } from './status-editor'

// The staff-only "Page" group inside the on-page Settings panel (PageAdminBar). It tunes THE
// INTERIOR of the page (not the app-shell chrome) and renders the page-settings spine
// (lib/page-settings/sections.ts): a LIVE section shows its real control under a header; a
// staged one renders an honest, non-interactive "Next" row. SEO is live (ADR-268); Status
// too. The LAYOUT editor only shows on module-driven routes (isModuleRoute) — a hand-built
// page never offers a Layout panel whose modules don't match its real content.

const SECTION_ICON: Record<PageSettingSection['id'], LucideIcon> = {
  layout: LayoutGrid,
  seo: Search,
  status: Eye,
}

export function PageSettingsModule({ spaceId }: { spaceId?: string } = {}) {
  const pathname = usePathname()
  // Layout is only meaningful where the page renders <PageModules>; everywhere else,
  // drop it so Settings shows just the SEO + Status controls that actually apply.
  const sections = PAGE_SETTING_SECTIONS.filter((s) => s.id !== 'layout' || isModuleRoute(pathname))

  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Page</p>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Tune what shows inside this page. The app shell (the global rails and header) stays put.
      </p>
      <div className="space-y-4">
        {sections.map((section) => {
          const Icon = SECTION_ICON[section.id]

          if (section.status === 'live') {
            return (
              <div key={section.id}>
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  <span className="text-sm font-semibold text-text">{section.label}</span>
                </div>
                <p className="mb-2 text-xs text-muted">{section.hint}</p>
                {section.id === 'layout' && <LayoutEditor spaceId={spaceId} />}
                {section.id === 'seo' && <SeoEditor spaceId={spaceId} />}
                {section.id === 'status' && <StatusEditor spaceId={spaceId} />}
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
