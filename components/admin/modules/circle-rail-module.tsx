'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { RailLayoutEditor } from '@/components/circles/rail-layout-editor'
import { coerceLayout } from '@/lib/circles/rail-layout'
import { getCircleAdminData, saveSidebarOrder } from '@/app/(main)/circles/admin-actions'

// In-place "Rail layout" admin module. Self-loads via getCircleAdminData (which returns
// null unless the caller holds circle.editSettings) and renders the reorder + show/hide
// editor for THIS circle's right-rail blocks — the per-circle override of the operator
// default. Mirrors CircleQuestModule's self-loading, so a viewer who can't manage this
// circle sees nothing here.

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

export function CircleRailModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleAdminData(slug).then((d) => {
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
  if (loading) return null
  if (!data) return null // not permitted / not found → no chrome

  // No card chrome — sits flush on the panel's white surface.
  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h3 className="text-sm font-bold text-text">Rail layout</h3>
        <p className="text-sm text-muted">
          Arrange or hide the blocks in this circle&apos;s right rail. Leave it untouched to follow the
          network default.
        </p>
      </header>

      <RailLayoutEditor
        initial={coerceLayout(data.sidebar_order)}
        save={saveSidebarOrder.bind(null, data.id, data.slug)}
        description="Drag to reorder. Toggle the eye to hide a block from this circle."
      />
    </section>
  )
}
