'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { getSpaceStarterChip } from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// SPACE STARTER CHIP (Space menu regroup, ADR-520) — a compact one-line "Starter: {preset}" chip pinned
// just under the Identity section of a Space's rail. It demotes Space Mode from a full settings section to
// a glanceable chip: a Starter arranges your page and suggests a pipeline; every tool stays available; you
// can change it any time. A "Change" affordance opens the Mode and focus editor. Self-fetches via the
// read-gated getSpaceStarterChip: FAIL-SAFE — a non-manager (or a failed read, or no slug) gets null and
// the chip renders NOTHING (never a weakened gate). Tokens only, no hex; no em dashes (CONTENT-VOICE §10).

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceStarterChip>>>

export function SpaceStarterChip({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceStarterChip(slug)
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
    return <div className="h-8 animate-pulse rounded-full border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not a manager / no mode → no chrome

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs text-muted">
        <span className="font-semibold text-text">Starter:</span> {data.label}
      </span>
      <Link
        href={`/spaces/${data.slug}/manage/mode`}
        className="shrink-0 text-2xs font-semibold text-primary hover:underline"
      >
        Change
      </Link>
    </div>
  )
}
