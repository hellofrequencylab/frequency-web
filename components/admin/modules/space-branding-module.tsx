'use client'

import { usePathname } from 'next/navigation'
import { getSpaceBrandingData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpaceBrandingForm } from '@/components/spaces/space-branding-form'
import { RailModuleLoading } from './rail-module-loading'
import { useSpaceRailSlice } from './space-rail-data'

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
        readOnly={data.readOnly}
      />
    </section>
  )
}
