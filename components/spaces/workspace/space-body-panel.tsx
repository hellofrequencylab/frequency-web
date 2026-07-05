import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { SURFACE_PANELS } from './surface-panels'
import { MembersBody } from '@/app/(main)/spaces/[slug]/settings/members/members-body'

// INLINE WORKSPACE — the panel BODY (Stage D1). The Space profile's persistent hero + tab menu live in
// the (profile) route-group layout, so a `?panel=<id>` soft-navigation swaps ONLY this body (the layout
// does not re-render on a query change). This component REPLACES the normal profile body with the chosen
// surface, rendered inline: a light header (the surface label + a "Back to page" link that clears the
// panel + an "Open full page" link out to the standalone route) above the surface body itself.
//
// The page already gated: it renders this ONLY for a viewer who can manage the Space AND a known panel id
// (isPanelId). We still look the panel up defensively and return null on a miss, so the page falls back to
// its normal body. DAWN semantic tokens only; voice-canon copy (no em dashes).

export function SpaceBodyPanel({ slug, panel }: { slug: string; panel: string }) {
  const entry = SURFACE_PANELS[panel]
  if (!entry) return null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/spaces/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to page
          </Link>
          <span className="text-border" aria-hidden>
            /
          </span>
          <h1 className="text-xl font-bold text-text">{entry.label}</h1>
        </div>
        <Link
          href={entry.fullHref(slug)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong transition-colors hover:text-primary"
        >
          Open full page
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      {/* D1 ships ONE panel (Members). Later sub-stages branch on `panel` to mount other surface bodies
          here; the registry keeps the label + full-route mapping in one place. */}
      <MembersBody slug={slug} />
    </div>
  )
}
