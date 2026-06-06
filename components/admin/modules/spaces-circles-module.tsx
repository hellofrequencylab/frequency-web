'use client'

import { useEffect, useState } from 'react'
import { CirclesClient } from '@/app/(main)/admin/circles/circles-client'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'
import { loadCirclesAdmin } from '@/app/(main)/admin/circles/circles-admin-action'

// In-place "manage all circles" (ADR-138 — Spaces). Renders the existing
// NewCircleCompose + CirclesClient (create / edit / archive any circle in scope)
// inside the page admin console. Host+ via the loader, role-scoped. Complements the
// per-circle Basics module (one circle on its page) with the global list.

type Data = NonNullable<Awaited<ReturnType<typeof loadCirclesAdmin>>>

export function SpacesCirclesModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadCirclesAdmin().then((d) => {
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
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-3">
      <NewCircleCompose hubs={data.hubs} />
      <CirclesClient circles={data.circles} hubs={data.hubs} hosts={data.hosts} />
    </div>
  )
}
