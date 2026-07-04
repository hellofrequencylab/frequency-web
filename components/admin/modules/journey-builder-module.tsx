'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutGrid, ChevronRight } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getJourneyRailData, type JourneyRailData } from '@/app/(main)/journeys/admin-actions'

// In-place "Builder and layout" module (ADR-515 Phase 6, the 'layout' spine cell). A Journey's
// arrangeable structure is the Phase → Module → Lesson block tree plus the discovery page_config — both
// DATA-HEAVY (blocks · practices · pillars · Vera review), built for the full-page editor. Mounting that
// inline with fabricated props would be a broken picker, so — exactly like hub.layout / nexus.layout —
// this is a minimal, honest affordance: it links out to the full-page builder where the tree + advanced
// layout live. Self-fetches getJourneyRailData (null unless journey.editSettings), so it renders nothing
// for a non-owner (fail-safe).

export function JourneyBuilderModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/journeys\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<JourneyRailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getJourneyRailData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('journey.builder')
  const Icon = mod?.Icon ?? LayoutGrid

  return (
    <div className="@container space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-subtle" />
          {mod?.label ?? 'Builder and layout'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>

      <Link
        href={`/journeys/${data.slug}/edit`}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-elevated"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Open the builder</span>
          <span className="block text-xs text-muted">Arrange the Phase, Module, and Lesson structure and the discovery layout.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
      </Link>
    </div>
  )
}
