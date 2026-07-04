'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { getSpacePageData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpacePagePanel } from '@/components/spaces/space-page-panel'
import { SpacePageBuilder } from '@/components/entity-blocks/profile-page-builder'

// SPACE PAGE — the inline editor module for the standardized admin bar (ADR-514). Mirrors
// circle-settings-module: reads the Space slug from the live path (and which page's blocks to edit from
// the `?page=` param, default Home), calls the read-gated getSpacePageData(slug) on mount, and renders
// the EXISTING SpacePagePanel inline (pages, business info, cover size, cover style, theme/accent, and
// the focus echo). The getter re-gates server-side and returns null when the viewer cannot manage this
// Space, so a non-manager sees nothing here (the fail-safe). Every write re-gates in its own action.
//
// ADR-516 Phase D: on the Space profile ROOT (where the shared space-layout store is mounted) the
// SpacePageBuilder mounts ABOVE the panel — the freeform rows/slots outline editor that repaints the live
// page behind the slide-over. It self-guards to a space store on the matching slug, so on every other
// Space surface (manage / settings, where the member store is mounted) it renders nothing and only the
// panel shows.

type Data = NonNullable<Awaited<ReturnType<typeof getSpacePageData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpacePageModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  // Inline, the panel edits the Home page's blocks (the getter defaults to Home). The full per-page
  // block editor stays on the /manage/layout page + the "Edit your profile" grid the panel links to.
  useEffect(() => {
    if (!slug) return
    let active = true
    getSpacePageData(slug).then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <LayoutGrid className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Page
        </h3>
        <p className="text-sm text-muted">
          Your pages, cover, accent, and block order. Open the full editor to add and edit any block.
        </p>
      </header>
      {/* The in-rail page builder (ADR-516 Phase D) — mounts only on the Space profile root, where the
          space-layout store wraps both this rail and the live page it edits. */}
      <SpacePageBuilder slug={data.slug} />
      <SpacePagePanel
        slug={data.slug}
        pages={data.pages}
        activePageSlug={data.activePageSlug}
        maxPages={data.maxPages}
        coverSize={data.coverSize}
        coverScrim={data.coverScrim}
        accent={data.accent}
        profileTemplate={data.profileTemplate}
        businessInfo={data.businessInfo}
        coverImageUrl={data.coverImageUrl}
        brandLogoUrl={data.brandLogoUrl}
        websitePublished={data.websitePublished}
        canManagePages={data.canManagePages}
        focus={data.focus}
        readOnly={data.readOnly}
      />
    </section>
  )
}
