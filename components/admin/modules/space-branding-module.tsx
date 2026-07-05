'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getSpaceBrandingData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpaceBrandingForm } from '@/components/spaces/space-branding-form'
import { RailModuleLoading } from './rail-module-loading'

// SPACE BRANDING — Section 2 of the Space rail (the profile+identity rework). Reads the Space slug from the
// live path, calls the read-gated getSpaceBrandingData(slug) on mount, and renders the SpaceBrandingForm
// inline: every VISUAL field (header image, logo, cover style, accent) in one place. The getter re-gates
// server-side and returns null when the viewer cannot manage this Space (fail-safe). Each control re-checks
// its own write authority server-side. No module header: the rail labels this group "Branding".

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceBrandingData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceBrandingModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceBrandingData(slug).then((d) => {
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
        readOnly={data.readOnly}
      />
    </section>
  )
}
