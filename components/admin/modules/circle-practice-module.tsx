'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { SetCirclePractice } from '@/components/practice/set-circle-practice'
import {
  getCirclePracticeAssignData,
  type CirclePracticeAssignData,
} from '@/app/(main)/circles/admin-actions'

// In-place "This week's practice" module (ADR-515 Phase 4, the CIRCLE rail, the 'engage' spine cell).
// Renders in the page admin rail on /circles/[slug]; the server returns null unless the caller holds
// circle.assignTask, so the module shows nothing for anyone else. Wraps the host practice picker (the
// SetCirclePractice control, extracted out of Circle Quest); setting the practice reuses
// setCirclePracticeAction, which re-checks circle.editSettings server-side (co-granted to a circle
// leader, so the write gate is never weaker than this read gate).

export function CirclePracticeModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CirclePracticeAssignData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCirclePracticeAssignData(slug)
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
    return <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const mod = moduleById('circle.practice')
  const Icon = mod?.Icon ?? Sparkles

  return (
    <div className="@container space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? "This week's practice"}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <SetCirclePractice
          circleId={data.circleId}
          library={data.library}
          current={data.activePracticeId ?? undefined}
        />
      </section>
    </div>
  )
}
