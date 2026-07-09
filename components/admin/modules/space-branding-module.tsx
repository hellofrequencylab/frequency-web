'use client'

import { usePathname } from 'next/navigation'
import { getSpaceBrandingData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpaceBrandingForm } from '@/components/spaces/space-branding-form'
import type { HeroHeight, HeroButtonOrientation } from '@/lib/spaces/hero-config'
import { RailModuleLoading } from './rail-module-loading'
import { useSpaceRailData, useSpaceRailSlice } from './space-rail-data'

// SPACE BRANDING — Section 2 of the Space rail (the profile+identity rework). Reads the Space slug from the
// live path, calls the read-gated getSpaceBrandingData(slug) on mount, and renders the SpaceBrandingForm
// inline: every VISUAL field (header image, logo, cover style, accent) in one place. The getter re-gates
// server-side and returns null when the viewer cannot manage this Space (fail-safe). Each control re-checks
// its own write authority server-side. No module header: the rail labels this group "Branding".

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceBrandingModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  // Slice from the shared rail bundle (ADR-550); self-fetch fallback keeps it working standalone.
  const { data, loading } = useSpaceRailSlice(slug, (b) => b.branding, getSpaceBrandingData)
  // The hero LOOK (height + button orientation) lives in the layout slice of the same bundle (item 5 moved
  // its editing here). Standalone (no bundle) it is undefined, so the form falls back to its defaults.
  const ctx = useSpaceRailData()
  const heroLook = ctx?.status === 'ready' ? ctx.bundle?.layout?.hero : undefined

  if (!slug) return null
  if (loading) return <RailModuleLoading />
  if (!data) return null // not permitted / not found → no chrome

  return (
    <section className="min-w-0">
      <SpaceBrandingForm
        spaceId={data.spaceId}
        slug={data.slug}
        brandName={data.brandName}
        tagline={data.tagline}
        coverImageUrl={data.coverImageUrl}
        brandLogoUrl={data.brandLogoUrl}
        coverScrim={data.coverScrim}
        accent={data.accent}
        headerCta={data.headerCta}
        defaultCtaLabel={data.defaultCtaLabel}
        pageTheme={data.pageTheme}
        heroHeight={heroLook?.height as HeroHeight | undefined}
        heroButtonOrientation={heroLook?.buttonOrientation as HeroButtonOrientation | undefined}
        readOnly={data.readOnly}
      />
    </section>
  )
}
