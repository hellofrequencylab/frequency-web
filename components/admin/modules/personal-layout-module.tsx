'use client'

import { useEffect, useState } from 'react'
import { getProfileRailData } from '@/app/(main)/settings/rail-getters'
import { appById } from '@/lib/apps/catalog'
import { SurfaceLinkRow } from './surface-link-row'

// Personal "You" module (ADR-515 Phase 2 — "a layout chooser in every rail"): the member's profile
// grid/layout editor, surfaced as a compact link-row. The destination —
// /people/<handle>/profile-preview/edit — is not resolvable from the global scope alone (it needs the
// member's handle), so this is a tiny inline module that self-fetches the handle via the read-gated
// getProfileRailData and renders the standard SurfaceLinkRow. Fail-safe: getProfileRailData returns null
// when signed out, and a profile with no handle renders nothing (never a dead row).

export function PersonalLayoutModule() {
  const [handle, setHandle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getProfileRailData().then((d) => {
      if (!active) return
      setHandle(d?.initial.handle || null)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const app = appById('account.layout')

  if (loading) {
    return <div className="h-11 animate-pulse rounded-lg border border-border bg-surface-elevated/50" />
  }
  if (!app || !handle) return null // signed out / no handle → no chrome

  return <SurfaceLinkRow app={app} href={`/people/${handle}/profile-preview/edit`} />
}
