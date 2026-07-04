'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutGrid, ChevronRight } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { getHubAdminData } from '@/app/(main)/hubs/admin-actions'

// In-place "Layout" module (ADR-515 Phase 5, the 'layout' spine cell for hubs). Every rail carries a
// layout chooser (the owner directive), but the hub detail page is HAND-BUILT (fixed sections: identity →
// insight → circles), NOT <PageModules>-driven, so there is no arrangeable block set to reorder. Rather
// than fabricate a broken picker, this is a minimal, honest affordance: it states the page uses a standard
// fixed layout and links to the Manage console (where the hub's sections + settings live). Gated hub.manage
// server-side — getHubAdminData returns null unless the caller holds it, so this renders nothing otherwise.

type HubData = NonNullable<Awaited<ReturnType<typeof getHubAdminData>>>

export function HubLayoutModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/hubs\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getHubAdminData(slug)
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

  const mod = moduleById('hub.layout')
  const Icon = mod?.Icon ?? LayoutGrid

  return (
    <div className="@container space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-text">
          <Icon className="h-4 w-4 shrink-0 text-subtle" />
          {mod?.label ?? 'Layout'}
        </h3>
        {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
      </header>

      <Link
        href={`/hubs/${data.slug}/manage`}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-elevated"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Manage console</span>
          <span className="block text-xs text-muted">Basics, people, and the rest of the hub.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
      </Link>
    </div>
  )
}
