'use client'

import { useEffect, useState } from 'react'
import { VeraConfigForm } from '@/app/(main)/admin/vera/vera-config-form'
import { loadVeraAdmin } from '@/app/(main)/admin/vera/vera-action'

// In-place "Manage Vera" (ADR-149 — Platform). Reuses VeraConfigForm. Janitor only via
// the loader; renders nothing otherwise (degrades cleanly when stacked under Demo + AI in
// Platform). The config form is uncontrolled, so values survive a save without a re-fetch.

type Data = NonNullable<Awaited<ReturnType<typeof loadVeraAdmin>>>

export function VeraModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadVeraAdmin().then((d) => {
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

  return <VeraConfigForm cfg={data.cfg} featured={data.featured} />
}
