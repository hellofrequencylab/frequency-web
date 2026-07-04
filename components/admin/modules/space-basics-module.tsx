'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Info } from 'lucide-react'
import { getSpaceBasicsData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpaceSettingsForm } from '@/app/(main)/spaces/[slug]/settings/settings-form'

// SPACE BASICS — the inline editor module for the standardized admin bar (ADR-514). Mirrors
// circle-settings-module EXACTLY: reads the Space slug from the live path, calls the read-gated
// getSpaceBasicsData(slug) on mount, and renders the EXISTING SpaceSettingsForm inline. The getter
// re-gates server-side and returns null when the viewer cannot manage this Space, so a non-manager sees
// nothing here (the fail-safe). The form's own updateSpaceProfile re-checks canEditProfile, so this is a
// convenience over an unchanged server gate.

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceBasicsData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceBasicsModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceBasicsData(slug).then((d) => {
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
          <Info className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Basics
        </h3>
        <p className="text-sm text-muted">Name, brand, about, and who can find this space.</p>
      </header>
      <SpaceSettingsForm
        spaceId={data.spaceId}
        slug={data.slug}
        initial={data.initial}
        readOnly={data.readOnly}
      />
    </section>
  )
}
