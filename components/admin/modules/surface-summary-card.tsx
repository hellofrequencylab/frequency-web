'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import type { App } from '@/lib/apps/types'
import { SurfaceLinkRow } from './surface-link-row'
import type { SurfaceSummaryEntry } from './surface-summaries'
import { allowanceAt, featureMeter, USAGE_UPGRADE_THRESHOLD } from '@/lib/pricing/feature-meters'

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

  const [data, setData] = useState<{ count: number; tier?: string } | null>(null)
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

  // ── The inline usage meter (ADR-520 P2) — a thin usage line on a metered surface's card. It shows the
  //    live count against the current plan's allowance with a quiet fill bar, and a subtle "Upgrade" nudge
  //    once usage crosses USAGE_UPGRADE_THRESHOLD. Informs, never blocks. Rendered only when the entry
  //    carries a meterKey AND the getter returned a `tier`; an unlimited allowance shows no bar/nudge. ──
  const ladder = entry.meterKey ? featureMeter(entry.meterKey) : null
  const allowance = entry.meterKey && data.tier ? allowanceAt(entry.meterKey, data.tier) : null
  const meter =
    ladder && data.tier
      ? {
          unit: ladder.unit,
          allowance, // null = unlimited
          ratio: allowance && allowance > 0 ? Math.min(1, data.count / allowance) : 0,
          nearLimit: allowance != null && allowance > 0 && data.count / allowance >= USAGE_UPGRADE_THRESHOLD,
        }
      : null
  const billingHref = `/spaces/${slug}/settings/billing`

  // Resolved: the SurfaceLinkRow chrome PLUS the inline stat + a "View more" affordance, in one card. The
  // main row is a single Link to the surface's page; the optional usage meter (with its own Upgrade link)
  // is a SIBLING below it, so no anchor is ever nested inside another.
  return (
    <div className="rounded-lg border border-border bg-surface">
      <Link
        href={href}
        title={app.description}
        className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
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

      {meter && (
        <div className="border-t border-border px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-subtle">
              {meter.allowance == null
                ? `${data.count.toLocaleString('en-US')} ${meter.unit} · unlimited`
                : `${data.count.toLocaleString('en-US')} / ${meter.allowance.toLocaleString('en-US')} ${meter.unit}`}
            </span>
            {meter.nearLimit && (
              <Link
                href={billingHref}
                className="shrink-0 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong hover:bg-primary-bg/70"
              >
                Upgrade
              </Link>
            )}
          </div>
          {meter.allowance != null && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
              <div
                className={`h-full rounded-full ${meter.nearLimit ? 'bg-primary-strong' : 'bg-primary/60'}`}
                style={{ width: `${Math.round(meter.ratio * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
