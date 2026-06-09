'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SetCirclePractice } from '@/components/practice/set-circle-practice'
import { getCircleAdminData } from '@/app/(main)/circles/admin-actions'

// In-place "This week's practice" admin module. Split out of the Circle settings
// module so the practice picker is its own dock entry. Self-loads via
// getCircleAdminData, which returns null unless the caller holds circle.editSettings
// — so a viewer who can't manage this circle sees nothing here.

type CircleData = NonNullable<Awaited<ReturnType<typeof getCircleAdminData>>>

export function CirclePracticeModule() {
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
  if (loading) {
    return <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not permitted / not found → no chrome

  // No card chrome — sits flush on the panel's white surface.
  return (
    <section>
      <header className="mb-3 space-y-1">
        <h3 className="text-sm font-bold text-text">This week&apos;s practice</h3>
        <p className="text-sm text-muted">Pick the practice your circle is focused on this week.</p>
      </header>
      <SetCirclePractice
        circleId={data.id}
        library={data.practice_library}
        current={data.active_practice_id ?? undefined}
      />
    </section>
  )
}
