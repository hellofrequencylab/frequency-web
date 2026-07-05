'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getSpaceSettingsData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpaceSettingsForm } from '@/components/spaces/space-settings-form'
import { RailModuleLoading } from './rail-module-loading'

// SPACE SETTINGS — the lower Settings section of the standardized rail (ADR-535). Reads the Space slug from
// the live path, calls the read-gated getSpaceSettingsData(slug) on mount, and renders the SpaceSettingsForm
// inline: the less-frequent knobs pulled out of the forward-facing sections (rating + visibility). The
// getter re-gates server-side and returns null when the viewer cannot manage this Space (fail-safe).

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceSettingsData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceSettingsModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceSettingsData(slug).then((d) => {
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
      <SpaceSettingsForm
        spaceId={data.spaceId}
        slug={data.slug}
        rating={data.rating}
        ratingCount={data.ratingCount}
        visibility={data.visibility}
        readOnly={data.readOnly}
      />
    </section>
  )
}
