'use client'

import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { getSpacePageData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpacePagePanel } from '@/components/spaces/space-page-panel'
import { SpacePageBuilder } from '@/components/entity-blocks/profile-page-builder'
import type { BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { RailModuleLoading } from './rail-module-loading'
import { useSpaceRailData, useSpaceRailSlice } from './space-rail-data'

// SPACE PAGE — the inline editor module for the standardized admin bar (ADR-514). Mirrors
// circle-settings-module: reads the Space slug from the live path (and which page's blocks to edit from
// the `?page=` param, default Home), calls the read-gated getSpacePageData(slug) on mount, and renders
// the EXISTING SpacePagePanel inline (pages, business info, cover size, cover style, theme/accent, and
// the focus echo). The getter re-gates server-side and returns null when the viewer cannot manage this
// Space, so a non-manager sees nothing here (the fail-safe). Every write re-gates in its own action.
//
// ADR-542 (revised): the page is arranged from the SIDEBAR — the SpacePageBuilder (rows + columns + move-
// between-rows) lives here, and the page itself shows the LIVE RESULT (no editing chrome). Every edit flows
// through the shared space-layout store, so the on-page preview repaints instantly. On the Space profile
// ROOT (where the shared space-layout store is mounted) the builder mounts ABOVE the panel; the builder
// self-guards to a space store, so on every other Space surface it renders nothing and only the panel shows.

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpacePageModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  // Inline, the panel edits the Home page's blocks (the getter defaults to Home). The full per-page
  // block editor stays on the /manage/layout page + the "Edit your profile" grid the panel links to.
  // The page slice + the builder seed both come from the ONE shared rail bundle (ADR-550); the module
  // falls back to its own getter when mounted outside the rail.
  const { data, loading } = useSpaceRailSlice(slug, (b) => b.page, getSpacePageData)
  const ctx = useSpaceRailData()

  if (!slug) return null
  if (loading) return <RailModuleLoading />
  if (!data) return null // not permitted / not found → no chrome

  // Seed the builder from the SAME bundle when the provider supplied one, so it skips its own
  // getSpaceLayoutRailData fetch. `undefined` (no provider / provider errored) → the builder self-fetches;
  // an explicit `null` (viewer cannot edit the layout) → the builder skips the fetch and renders nothing.
  const builderSeed: BuilderRailData | null | undefined =
    ctx?.status === 'ready'
      ? ctx.bundle?.layout
        ? {
            matchId: ctx.bundle.layout.slug,
            rows: ctx.bundle.layout.rows,
            hidden: ctx.bundle.layout.hidden,
            customized: ctx.bundle.layout.customized,
            lockedIds: ctx.bundle.layout.lockedIds,
            pickerData: ctx.bundle.layout.pickerData,
          }
        : null
      : undefined

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <LayoutGrid className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Page
        </h3>
        <p className="text-sm text-muted">
          Arrange the sections of your page into rows and columns here. The page beside you updates as you go.
        </p>
      </header>
      {/* ADR-542 (revised): the sidebar arranger. Rows + columns + move a section between rows; the page
          shows the live result. It reads the shared space-layout store, so it only shows on the Space
          profile root; every other Space surface renders just the panel below. The pinned Top Hero editor
          (fixed first section) seeds off the SAME bundle. */}
      <SpacePageBuilder
        slug={data.slug}
        seed={builderSeed}
        heroInitial={ctx?.status === 'ready' ? ctx.bundle?.layout?.hero : undefined}
      />
      <SpacePagePanel
        slug={data.slug}
        pages={data.pages}
        activePageSlug={data.activePageSlug}
        maxPages={data.maxPages}
        websitePublished={data.websitePublished}
        canManagePages={data.canManagePages}
        readOnly={data.readOnly}
      />
    </section>
  )
}
