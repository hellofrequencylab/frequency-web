'use client'

import { useEffect, useState } from 'react'
import { AiControlsView } from '@/app/(main)/admin/ai/ai-controls-view'
import { loadAiControls } from '@/app/(main)/admin/ai/ai-action'

// In-place "AI controls" (ADR-149 — Platform). Reuses AiControlsView. Janitor only via
// the loader; renders nothing otherwise (degrades cleanly when stacked under Demo in
// Platform). `tick` re-runs the fetch after a toggle/reindex so the embedded view stays
// in sync (the inner buttons can't router-refresh the module's own state).

type Data = NonNullable<Awaited<ReturnType<typeof loadAiControls>>>

export function AiModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    loadAiControls().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [tick])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return <AiControlsView data={data} onChanged={() => setTick((t) => t + 1)} />
}
