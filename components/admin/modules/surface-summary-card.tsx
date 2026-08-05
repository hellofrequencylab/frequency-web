'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import type { App } from '@/lib/apps/types'
import { SurfaceLinkRow } from './surface-link-row'
import type { SurfaceSummaryEntry } from './surface-summaries'
import { useSpaceRailSummary } from './space-rail-data'
import { ALLOWANCE_NUDGE, allowanceAt, featureMeter, nearAllowanceLimit } from '@/lib/pricing/feature-meters'

// SURFACE SUMMARY CARD — the Phase 2 "keep it in the rail" affordance (ADR-514). A generic card for a
// `render: 'link'` Space surface that has a glanceable stat (SURFACE_SUMMARIES[id]). It keeps the SIGNAL in
// the rail (an inline count) while the deep workflow still opens its own page ("View more"). The count comes
// from the ONE shared rail bundle (useSpaceRailSummary) instead of a per-card 'use server' round-trip that
// re-ran the whole resolve chain — the slow-rail fix (ADR-550 follow-up). Mounted outside the rail (or on a
// bundle error) it self-fetches through the card's own getter, unchanged. FAIL-SAFE: a null/failed count, or
// no slug, degrades to a plain SurfaceLinkRow (never a broken card, never a weakened gate). Tokens only.

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SurfaceSummaryCard({
  app,
  href,
  entry,
  surfaceId,
}: {
  app: App
  href: string
  entry: SurfaceSummaryEntry
  /** The registry surface id (e.g. 'space.people') — the key this card's count sits under in the shared
   *  rail bundle. The card reads its slice from the provider by this id, falling back to `entry.getter`. */
  surfaceId: string
}) {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  // Read the count from the one shared rail bundle (isolation fallback = the card's own getter).
  const { data, loading } = useSpaceRailSummary(slug, surfaceId, entry.getter)

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
  //    live count against the current plan's allowance with a quiet fill bar, and once usage crosses
  //    USAGE_UPGRADE_THRESHOLD the shared ALLOWANCE_NUDGE sentence + a "See plans" link (ADR-837).
  //    Informs, never blocks. Rendered only when the entry carries a meterKey AND the getter returned a
  //    `tier`; an unlimited allowance shows no bar/nudge. ──
  const ladder = entry.meterKey ? featureMeter(entry.meterKey) : null
  const allowance = entry.meterKey && data.tier ? allowanceAt(entry.meterKey, data.tier) : null
  const meter =
    ladder && data.tier
      ? {
          unit: ladder.unit,
          allowance, // null = unlimited
          ratio: allowance && allowance > 0 ? Math.min(1, data.count / allowance) : 0,
          nearLimit: nearAllowanceLimit(entry.meterKey!, data.tier, data.count),
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
          <span className="block truncate text-body-sm font-medium text-text">{app.label}</span>
          <span className="block truncate text-meta text-subtle">{entry.format(data)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-2xs font-medium text-muted transition-colors group-hover:text-primary-strong">
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
            <span className="text-2xs text-muted">
              {meter.allowance == null
                ? `${data.count.toLocaleString('en-US')} ${meter.unit} · unlimited`
                : `${data.count.toLocaleString('en-US')} / ${meter.allowance.toLocaleString('en-US')} ${meter.unit}`}
            </span>
            {meter.nearLimit && (
              <Link
                href={billingHref}
                className="shrink-0 rounded-pill bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong hover:bg-primary-bg/70"
              >
                See plans
              </Link>
            )}
          </div>
          {meter.allowance != null && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-pill bg-surface-elevated" aria-hidden>
              <div
                className={`h-full rounded-pill ${meter.nearLimit ? 'bg-primary-strong' : 'bg-primary/60'}`}
                style={{ width: `${Math.round(meter.ratio * 100)}%` }}
              />
            </div>
          )}
          {/* The one shared nudge sentence (ADR-837): plain, no urgency, links only via the chip above. */}
          {meter.nearLimit && <p className="mt-1 text-2xs text-muted">{ALLOWANCE_NUDGE}</p>}
        </div>
      )}
    </div>
  )
}
