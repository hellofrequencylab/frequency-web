'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { getSpacePageData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpacePagePanel } from '@/components/spaces/space-page-panel'
import { SpaceLayoutRailNote } from '@/components/spaces/space-layout-rail-note'
import { RailModuleLoading } from './rail-module-loading'

// SPACE PAGE — the inline editor module for the standardized admin bar (ADR-514). Mirrors
// circle-settings-module: reads the Space slug from the live path (and which page's blocks to edit from
// the `?page=` param, default Home), calls the read-gated getSpacePageData(slug) on mount, and renders
// the EXISTING SpacePagePanel inline (pages, business info, cover size, cover style, theme/accent, and
// the focus echo). The getter re-gates server-side and returns null when the viewer cannot manage this
// Space, so a non-manager sees nothing here (the fail-safe). Every write re-gates in its own action.
//
// ADR-542: the freeform layout is edited ON THE PAGE now (the WYSIWYG OnPageEditor over the live grid), so
// the in-rail rows builder is retired here. On the Space profile ROOT (where the shared space-layout store
// is mounted) a compact SpaceLayoutRailNote mounts ABOVE the panel — it points the owner at the on-page
// editor and lets them restore a hidden section. It self-guards to a space store, so on every other Space
// surface (manage / settings, where the member store is mounted) it renders nothing and only the panel shows.

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
  if (loading) return <RailModuleLoading />
  if (!data) return null // not permitted / not found → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <LayoutGrid className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Page
        </h3>
        <p className="text-sm text-muted">
          Your pages, cover, and accent. Arrange the sections on your page right on the page itself.
        </p>
      </header>
      {/* ADR-542: the space page layout is edited ON THE PAGE now (the WYSIWYG OnPageEditor over the live
          grid), so the cramped in-rail rows builder is retired. This compact note points the owner there and
          lets them restore a hidden section. It reads the same space-layout store, so it only shows on the
          Space profile root; every other Space surface renders just the panel below. */}
      <SpaceLayoutRailNote />
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
