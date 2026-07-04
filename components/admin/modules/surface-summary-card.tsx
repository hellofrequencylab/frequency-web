'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import type { App } from '@/lib/apps/types'
import { SurfaceLinkRow } from './surface-link-row'
import type { SurfaceSummaryEntry } from './surface-summaries'

// SURFACE SUMMARY CARD — the Phase 2 "keep it in the rail" affordance (ADR-514). A generic, self-fetching
// card for a `render: 'link'` Space surface that has a glanceable stat (SURFACE_SUMMARIES[id]). It keeps
// the SIGNAL in the rail (an inline count) while the deep workflow still opens its own page ("View more").
// Mirrors space-basics-module: read the slug from the live path, call the read-gated getter in an effect,
// skeleton while loading. FAIL-SAFE: a null/failed getter, or no slug, degrades to a plain SurfaceLinkRow
// (never a broken card, never a weakened gate — the getter re-gates server-side). Tokens only, no hex.

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SurfaceSummaryCard({
  app,
  href,
  entry,
}: {
  app: App
  href: string
  entry: SurfaceSummaryEntry
}) {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  const [data, setData] = useState<{ count: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    entry
      .getter(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        // A failed read must never leave a broken card — drop to the plain link-row (data stays null).
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug, entry])

  // Loading: a stable-height skeleton matching the SurfaceLinkRow chrome (no CLS while resolving).
  if (loading && slug) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2"
        aria-hidden
      >
        <span className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-surface-elevated" />
        <span className="h-4 flex-1 animate-pulse rounded bg-surface-elevated" />
      </div>
    )
  }

  // No slug / not permitted / read failed → the plain link-row (fail-safe degradation).
  if (!slug || !data) {
    return <SurfaceLinkRow app={app} href={href} />
  }

  const Icon = app.surfaces.editor?.Icon
  // Resolved: the SurfaceLinkRow chrome PLUS the inline stat + a "View more" affordance. The whole card is
  // one Link to the surface's page (so it is never nested inside another anchor).
  return (
    <Link
      href={href}
      title={app.description}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
    >
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">{app.label}</span>
        <span className="block truncate text-xs text-subtle">{entry.format(data)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-2xs font-medium text-subtle transition-colors group-hover:text-primary-strong">
        View more
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </span>
    </Link>
  )
}
