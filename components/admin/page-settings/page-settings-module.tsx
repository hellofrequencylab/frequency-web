'use client'

import { usePathname } from 'next/navigation'
import { LayoutGrid, Search, Eye, Type, type LucideIcon } from 'lucide-react'
import { PAGE_SETTING_SECTIONS, type PageSettingSection } from '@/lib/page-settings/sections'
import { isModuleRoute } from '@/lib/widgets/module-routes'
import { LayoutEditor } from './layout-editor'
import { SeoEditor } from './seo-editor'
import { StatusEditor } from './status-editor'
import { SubtitleEditor } from './subtitle-editor'

// The staff-only "Page" group inside the on-page Settings panel (PageAdminBar). It tunes THE
// INTERIOR of the page (not the app-shell chrome) and renders the page-settings spine in
// hierarchy order (lib/page-settings/sections.ts): a LIVE section shows its real control under
// a header; a staged one renders an honest, non-interactive "Next" row. The hierarchy is
// Basics (title + header image) → Status & visibility → SEO & meta (description + share image)
// → Layout. Basics + SEO are two PANES of the one SeoEditor (each saves only its own fields).
// The LAYOUT editor only shows on module-driven routes (isModuleRoute) — a hand-built page
// never offers a Layout panel whose modules don't match its real content; that section is
// dropped here so each page exposes only the sections that apply to it.
//
// ADMIN ROUTES (ADR-359): on /admin/* the Page settings are trimmed to ONLY a Subtitle editor
// (the page's header description) + the Layout editor. The admin workspaces own their own title,
// chrome, and visibility (the /admin layout gates access), and they aren't search-indexed, so
// Basics (title + header image), Status & visibility, and SEO/share-image would be noise there.

const SECTION_ICON: Record<PageSettingSection['id'], LucideIcon> = {
  basics: Type,
  status: Eye,
  seo: Search,
  layout: LayoutGrid,
}

export function PageSettingsModule({
  spaceId,
  hideBasics = false,
}: { spaceId?: string; hideBasics?: boolean } = {}) {
  const pathname = usePathname()

  // Admin routes get the trimmed Page settings: Subtitle + Layout only.
  if (pathname.startsWith('/admin')) {
    return (
      <div className="min-w-0">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Page</p>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Tune what shows inside this page. The app shell (the global rails and header) stays put.
        </p>
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Type className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="text-sm font-semibold text-text">Subtitle</span>
            </div>
            <p className="mb-2 text-xs text-muted">Set the line shown under the page title.</p>
            <SubtitleEditor />
          </div>
          {/* Layout only shows where the page renders <PageModules>. */}
          {isModuleRoute(pathname) && (
            <div>
              <div className="mb-1 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="text-sm font-semibold text-text">Layout</span>
              </div>
              <p className="mb-2 text-xs text-muted">
                Choose which blocks show inside the page and their order. Tunes the page, never the app shell.
              </p>
              <LayoutEditor spaceId={spaceId} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // Layout is only meaningful where the page renders <PageModules>; everywhere else,
  // drop it so Settings shows just the Basics + Status + SEO controls that actually apply.
  // `hideBasics` drops the Basics pane (title + header image) on pages that ALSO render the
  // richer "Page content" editor (headline/description/hero/CTA) — the two overlap, so showing
  // both is the redundancy this removes. Status / SEO / Layout stay (they don't overlap).
  const sections = PAGE_SETTING_SECTIONS.filter(
    (s) =>
      (s.id !== 'layout' || isModuleRoute(pathname)) && !(hideBasics && s.id === 'basics'),
  )

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
                {section.id === 'basics' && <SeoEditor spaceId={spaceId} pane="basics" />}
                {section.id === 'status' && <StatusEditor spaceId={spaceId} />}
                {section.id === 'seo' && <SeoEditor spaceId={spaceId} pane="meta" />}
                {section.id === 'layout' && <LayoutEditor spaceId={spaceId} />}
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
