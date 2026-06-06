'use client'

import { useEffect, useState } from 'react'
import { CrewTasksClient } from '@/app/(main)/admin/crew-tasks/crew-tasks-client'
import { NewTaskCompose } from '@/components/compose/new-task-compose'
import { loadCrewTasksAdmin } from '@/app/(main)/admin/crew-tasks/crew-tasks-action'

// In-place "define & verify crew tasks" (ADR-138 — Engage). Reuses NewTaskCompose +
// CrewTasksClient. Host+ via the loader; renders nothing otherwise (degrades cleanly
// when stacked under Gamification in Engage).

type Data = NonNullable<Awaited<ReturnType<typeof loadCrewTasksAdmin>>>

export function CrewTasksModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadCrewTasksAdmin().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <NewTaskCompose />
      </div>
      <CrewTasksClient tasks={data.tasks} pendingVerifications={data.pendingVerifications} />
    </div>
  )
}
