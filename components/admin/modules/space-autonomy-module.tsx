'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getSpaceAutonomyData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { AutonomyControl } from '@/app/(main)/spaces/[slug]/crm/autonomy-control'

// VERA AUTONOMY — the inline rail control for the standardized admin bar (Resonance Engine Phase 3 ·
// ADR-384; rail control ADR-517 Phase F GAP 2). Mirrors space-mode-module: reads the Space slug from the
// live path, calls the read-gated getSpaceAutonomyData(slug) on mount, and renders the EXISTING
// AutonomyControl inline. The getter re-gates owner/admin (caps.canManageMembers) server-side and returns
// null otherwise, so a non-manager sees nothing here; AutonomyControl's own setSpaceAutonomy write
// re-gates the same authority, so this is convenience over an unchanged gate.

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceAutonomyData>>>

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceAutonomyModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceAutonomyData(slug).then((d) => {
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
    return <div className="h-32 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          Vera autonomy
        </h3>
        <p className="text-sm text-muted">Choose how much Vera does on its own for this space.</p>
      </header>
      <AutonomyControl slug={data.slug} level={data.level} />
    </section>
  )
}
