'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSpaceIdentityData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// SPACE IDENTITY STRIP — the compact, read-only identity header pinned at the very top of a Space's
// standard tier (Phase 2 "keep it in the rail", ADR-514). A glanceable cover + logo + name so the operator
// always knows which space they are editing, with a small "Edit" affordance out to the Basics editor. Self-
// fetches via the read-gated getSpaceIdentityData: FAIL-SAFE — a non-manager (or a failed read, or no slug)
// gets null and the strip renders NOTHING (never a weakened gate). Tokens only, no hex.

type Data = NonNullable<Awaited<ReturnType<typeof getSpaceIdentityData>>>

/** First letter of the space name for the logo placeholder (uppercased), or a neutral dot. */
function initial(name: string): string {
  const c = name.trim().charAt(0)
  return c ? c.toUpperCase() : '·'
}

export function SpaceIdentityStrip({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getSpaceIdentityData(slug)
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
    return <div className="h-16 animate-pulse rounded-lg border border-border bg-surface-elevated/50" />
  }
  if (!data) return null // not a manager / not found → no chrome

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2">
      <div className="relative h-12 w-16 shrink-0">
        <div className="h-full w-full overflow-hidden rounded-md border border-border bg-surface-elevated">
          {data.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-surface-elevated" />
          )}
        </div>
        {/* Logo chip, overlaid at the bottom-left corner of the cover. */}
        <span className="absolute -bottom-1.5 -left-1.5 flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-border bg-surface text-2xs font-bold text-primary-strong">
          {data.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.brandLogoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial(data.name)
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{data.name}</p>
        <Link
          href={`/spaces/${data.slug}/settings/basics`}
          className="inline-flex min-h-[44px] items-center text-xs font-medium text-primary hover:underline"
        >
          Edit
        </Link>
      </div>
    </div>
  )
}
