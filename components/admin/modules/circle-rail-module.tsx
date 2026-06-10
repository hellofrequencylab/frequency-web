'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SidebarWidgetEditor } from '@/components/circles/sidebar-widget-editor'
import { getCircleAdminData } from '@/app/(main)/circles/admin-actions'

// In-place "Rail layout" admin module. Self-loads via getCircleAdminData (which returns
// null unless the caller holds circle.editSettings) and renders the drag-and-drop
// reorder for the circle's right-rail blocks. Mirrors CircleQuestModule's self-loading,
// so a viewer who can't manage this circle sees nothing here.

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
        <p className="text-sm text-muted">Drag to reorder the blocks in this circle&apos;s right rail.</p>
      </header>

      <SidebarWidgetEditor circleId={data.id} slug={data.slug} order={data.sidebar_order} />
    </section>
  )
}
