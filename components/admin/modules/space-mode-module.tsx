'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { getSpaceModeData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { ModeSettings } from '@/app/(main)/spaces/[slug]/manage/mode/mode-settings'

// SPACE MODE AND FOCUS — the inline editor module for the standardized admin bar (ADR-514). Mirrors
// circle-settings-module: reads the Space slug from the live path, calls the read-gated
// getSpaceModeData(slug) on mount, and renders the EXISTING ModeSettings inline (current Mode/Focus, the
// "what this turns on" preview, the non-destructive Focus switcher, and per-module label/toggle
// overrides). The getter re-gates server-side and returns null when the viewer cannot manage this Space
// / the type has no Mode, so a non-manager sees nothing here (the fail-safe). Every write re-gates in
// its own action; Mode is FREE framing, never a gate.

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceModeData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceModeModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceModeData(slug).then((d) => {
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
  if (!data) return null // not permitted / not found / no Mode → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Mode and focus
        </h3>
        <p className="text-sm text-muted">
          Pick how this space runs, see what the preset turns on, and adjust it.
        </p>
      </header>
      <ModeSettings slug={data.slug} view={data.view} readOnly={data.readOnly} />
    </section>
  )
}
